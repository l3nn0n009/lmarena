import ChatBox from './components/ChatBox'
import MobileChatBox from './components/MobileChatBox'
import useIsMobile from './hooks/useIsMobile'
import './App.css'

function App() {
  const isMobile = useIsMobile(768);

  return (
    <div className="app">
      {isMobile ? <MobileChatBox /> : <ChatBox />}
    </div>
  )
}

export default App
