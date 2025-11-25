import React from 'react'
import ReactDOM from 'react-dom/client'
import { Home } from './ui/Home'
import { Dashboard } from './ui/Dashboard'

const Root: React.FC = () => {
  const [selectedFolder, setSelectedFolder] = React.useState<string | null>(null)

  if (selectedFolder === null) {
    return <Home onSelectFolder={setSelectedFolder} />
  }

  return <Dashboard folder={selectedFolder} onBack={() => setSelectedFolder(null)} />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)


