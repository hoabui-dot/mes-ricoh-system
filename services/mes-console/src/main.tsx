import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { MesQueryProvider } from './components/MesQueryProvider';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MesQueryProvider><App /></MesQueryProvider>
  </React.StrictMode>
);
