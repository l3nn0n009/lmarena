/**
 * NebulaCLI - Autonomy Engine
 * Enables "set it and forget it" task execution
 */

const { getSystemPrompt, getPlannerPrompt } = require('./prompts');
const orchestrator = require('./orchestrator');
const fs = require('fs');
const path = require('path');

class AutonomyEngine {
    constructor(lmarenaController) {
        this.lmarena = lmarenaController;
        this.currentPlan = null;
        this.currentStep = 0;
        this.isRunning = false;
        this.onProgress = null;  // Callback for progress updates
        this.onComplete = null;  // Callback for completion
        this.maxRetries = 3;
        this.stepResults = [];
    }

    /**
     * Generate an execution plan from a goal description
     * @param {string} goal - User's goal description
     * @param {object} context - Project context
     * @returns {object} Execution plan
     */
    async generatePlan(goal, context = {}) {
        this.emit('status', 'Generating execution plan...');

        // Use the planner model (Claude Opus for complex planning)
        const plannerModel = orchestrator.selectModel('planning');
        await this.lmarena.selectModel(plannerModel);

        const plannerPrompt = getPlannerPrompt(goal, JSON.stringify(context, null, 2));

        const response = await this.lmarena.sendMessage(plannerPrompt, (token) => {
            // Show streaming plan generation
            if (token.delta) {
                this.emit('token', token.delta);
            }
        });

        // Parse the plan from the response
        try {
            const jsonMatch = response.response.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                throw new Error('No valid plan JSON found in response');
            }
            const plan = JSON.parse(jsonMatch[0]);
            this.currentPlan = {
                goal,
                steps: plan,
                createdAt: new Date().toISOString(),
                status: 'pending'
            };
            return this.currentPlan;
        } catch (e) {
            throw new Error(`Failed to parse plan: ${e.message}`);
        }
    }

    /**
     * Execute the current plan autonomously
     * @param {object} options - Execution options
     */
    async executePlan(options = {}) {
        if (!this.currentPlan) {
            throw new Error('No plan to execute. Generate a plan first.');
        }

        if (this.isRunning) {
            throw new Error('Already executing a plan.');
        }

        this.isRunning = true;
        this.currentStep = 0;
        this.stepResults = [];
        this.currentPlan.status = 'running';

        const { startFromStep = 0, stopAfterStep = null } = options;

        try {
            for (let i = startFromStep; i < this.currentPlan.steps.length; i++) {
                if (!this.isRunning) {
                    this.emit('status', 'Execution paused by user.');
                    break;
                }

                if (stopAfterStep !== null && i > stopAfterStep) {
                    this.emit('status', `Stopped after step ${stopAfterStep + 1}.`);
                    break;
                }

                const step = this.currentPlan.steps[i];
                this.currentStep = i;

                await this.executeStep(step, i);
            }

            if (this.isRunning) {
                this.currentPlan.status = 'completed';
                this.emit('complete', {
                    plan: this.currentPlan,
                    results: this.stepResults
                });
            }

        } catch (e) {
            this.currentPlan.status = 'failed';
            this.emit('error', e.message);
            throw e;
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Execute a single step with retry logic
     */
    async executeStep(step, index) {
        const stepNum = index + 1;
        const totalSteps = this.currentPlan.steps.length;

        this.emit('step-start', {
            step: stepNum,
            total: totalSteps,
            action: step.action,
            model: step.model
        });

        // Select the appropriate model for this step
        const taskType = orchestrator.inferTaskType(step.action);
        const modelId = orchestrator.selectModel(taskType, {
            forceModel: step.model
        });

        this.emit('status', `[${stepNum}/${totalSteps}] Using ${modelId} for: ${step.action.substring(0, 50)}...`);

        let retries = 0;
        let lastError = null;

        while (retries < this.maxRetries) {
            try {
                // Switch model if needed
                await this.lmarena.selectModel(modelId);

                // Build the step prompt
                const stepPrompt = this.buildStepPrompt(step, this.stepResults);

                // Execute
                let fullResponse = '';
                const response = await this.lmarena.sendMessage(stepPrompt, (token) => {
                    fullResponse = token.fullText;
                    this.emit('token', token.delta);
                });

                // Extract and execute any tool calls
                const toolCalls = this.parseToolCalls(response.response);
                const toolResults = await this.executeToolCalls(toolCalls);

                // Store result
                const result = {
                    step: stepNum,
                    action: step.action,
                    model: modelId,
                    response: response.response,
                    toolCalls,
                    toolResults,
                    success: true
                };
                this.stepResults.push(result);

                // Report success to orchestrator
                orchestrator.reportSuccess(modelId);

                this.emit('step-complete', result);
                return result;

            } catch (e) {
                lastError = e;
                retries++;

                this.emit('status', `Step ${stepNum} failed (attempt ${retries}/${this.maxRetries}): ${e.message}`);

                // Report failure to orchestrator
                orchestrator.reportFailure(modelId);

                if (retries < this.maxRetries) {
                    // Wait before retry with exponential backoff
                    const waitTime = Math.pow(2, retries) * 1000;
                    this.emit('status', `Retrying in ${waitTime / 1000}s...`);
                    await this.delay(waitTime);
                }
            }
        }

        // All retries exhausted
        const failedResult = {
            step: stepNum,
            action: step.action,
            model: modelId,
            error: lastError.message,
            success: false
        };
        this.stepResults.push(failedResult);
        this.emit('step-failed', failedResult);

        // Continue to next step (don't throw)
        this.emit('status', `Step ${stepNum} failed after ${this.maxRetries} attempts. Continuing...`);
    }

    /**
     * Build the prompt for a specific step
     */
    buildStepPrompt(step, previousResults) {
        const context = previousResults.slice(-3).map(r =>
            `[Step ${r.step}] ${r.success ? '✓' : '✗'} ${r.action}: ${r.success ? 'Completed' : r.error}`
        ).join('\n');

        return `CURRENT TASK: ${step.action}

CONTEXT FROM PREVIOUS STEPS:
${context || 'This is the first step.'}

VERIFICATION: ${step.verification || 'Verify the action completed successfully.'}

Execute this step now. Use tool calls for file operations and commands.
After completion, briefly confirm what was done.`;
    }

    /**
     * Parse tool calls from response
     */
    parseToolCalls(response) {
        const toolCalls = [];
        const regex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
        let match;

        while ((match = regex.exec(response)) !== null) {
            const content = match[1];

            const toolMatch = content.match(/<tool>\s*(.*?)\s*<\/tool>/s);
            const pathMatch = content.match(/<path>\s*(.*?)\s*<\/path>/s);
            const contentMatch = content.match(/<content>([\s\S]*?)<\/content>/s);
            const commandMatch = content.match(/<command>\s*(.*?)\s*<\/command>/s);
            const queryMatch = content.match(/<query>\s*(.*?)\s*<\/query>/s);

            if (toolMatch) {
                toolCalls.push({
                    tool: toolMatch[1].trim(),
                    path: pathMatch ? pathMatch[1].trim() : null,
                    content: contentMatch ? contentMatch[1].replace(/^\n/, '').replace(/\n$/, '') : null,
                    command: commandMatch ? commandMatch[1].trim() : null,
                    query: queryMatch ? queryMatch[1].trim() : null
                });
            }
        }

        return toolCalls;
    }

    /**
     * Execute parsed tool calls
     */
    async executeToolCalls(toolCalls) {
        const results = [];

        for (const tc of toolCalls) {
            try {
                let result;

                switch (tc.tool) {
                    case 'create_file':
                    case 'write_file':
                    case 'edit_file':
                        result = await this.createFile(tc.path, tc.content);
                        break;

                    case 'read_file':
                        result = await this.readFile(tc.path);
                        break;

                    case 'run_command':
                        result = await this.runCommand(tc.command);
                        break;

                    case 'grep':
                        result = await this.grep(tc.query, tc.path);
                        break;

                    default:
                        result = { success: false, error: `Unknown tool: ${tc.tool}` };
                }

                results.push({ ...tc, result });
                this.emit('tool-result', { tool: tc.tool, ...result });

            } catch (e) {
                results.push({ ...tc, result: { success: false, error: e.message } });
                this.emit('tool-error', { tool: tc.tool, error: e.message });
            }
        }

        return results;
    }

    /**
     * Tool implementations
     */
    async createFile(filePath, content) {
        if (!filePath || content === undefined) {
            return { success: false, error: 'Missing path or content' };
        }

        try {
            const fullPath = path.resolve(process.cwd(), filePath);
            const dir = path.dirname(fullPath);

            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const existed = fs.existsSync(fullPath);
            fs.writeFileSync(fullPath, content, 'utf8');

            const lines = content.split('\n').length;
            return {
                success: true,
                action: existed ? 'updated' : 'created',
                path: filePath,
                lines
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    async readFile(filePath) {
        try {
            const fullPath = path.resolve(process.cwd(), filePath);
            const content = fs.readFileSync(fullPath, 'utf8');
            return { success: true, content, lines: content.split('\n').length };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    async runCommand(command) {
        // Note: In production, this should use child_process with proper safety
        this.emit('command', command);
        return { success: true, note: 'Command logged for manual execution' };
    }

    async grep(query, searchPath) {
        // Simplified grep - in production use actual grep
        return { success: true, note: `Would search for: ${query} in ${searchPath || '.'}` };
    }

    /**
     * Pause execution
     */
    pause() {
        this.isRunning = false;
        this.emit('status', 'Execution pausing after current step...');
    }

    /**
     * Resume execution
     */
    async resume() {
        if (this.currentPlan && !this.isRunning) {
            await this.executePlan({ startFromStep: this.currentStep + 1 });
        }
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            currentStep: this.currentStep,
            totalSteps: this.currentPlan?.steps.length || 0,
            stepResults: this.stepResults,
            plan: this.currentPlan
        };
    }

    /**
     * Emit events
     */
    emit(event, data) {
        if (this.onProgress) {
            this.onProgress({ event, data });
        }
        console.log(`[Autonomy] ${event}:`, typeof data === 'string' ? data : JSON.stringify(data).substring(0, 100));
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = AutonomyEngine;
