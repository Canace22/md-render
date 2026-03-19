import React from 'react';
import ReactDOM from 'react-dom/client';
import 'antd/dist/reset.css';
import MarkdownEditor from './components/MarkdownEditor.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MarkdownEditor />
  </React.StrictMode>
);
