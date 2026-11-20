import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/index.css'
import './styles/markdown.css'

const container = document.getElementById('root')
if (!container) throw new Error('找不到 #root 容器')

createRoot(container).render(<App />)
