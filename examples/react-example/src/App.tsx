import * as Y from 'yjs';
import { useEffect, useState } from 'react';
import { SocketIOProvider } from 'y-socket.io';

function App() {
  const [provider, setProvider] = useState<SocketIOProvider | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [input, setInput] = useState<string>('');
  const [clients, setClients] = useState<string[]>([]);

  useEffect(() => {
    if (!provider) setProvider(new SocketIOProvider(
      'ws://localhost:1234',
      'testing-doc',
      new Y.Doc(),
      {
        autoConnect: true,
        // disableBc: true,
        // auth: { token: 'valid-token' },
        onConnect: () => {
          setConnected(true);
        },
        onDisconnect: () => {
          setConnected(false);
        },
      }));
  }, [provider]);
  
  useEffect(() => {
    if (!provider) return;
    const yMap = provider.doc.getMap('data');
    if (!yMap.has('input')) {
      yMap.set('input', '');
      yMap.observe((event, transaction) => {
        setInput(yMap.get('input') as string);
      });
    }
  }, [provider, input]);

  useEffect(() => {
    if (!provider) return;
    provider.awareness.on('update', () => {
      setClients(Array.from(provider.awareness.getStates().keys()).map(key => `${key}`));
    });
    provider.awareness.setLocalState({
      id: Math.random(),
      name: 'Perico',
    });
  }, [provider]);

  if (!provider) return <h1>Initializing provider...</h1>;

  return (
    <div>
      App
      <div style={{ color: 'white' }}>
        <p>State: {connected ? 'Connected' : 'Disconneted'}</p>
        {
          !provider.socket.connected
            ? <>
              <button onClick={() => provider.connect()}>Connect</button>
            </>
            : <div style={{ display: 'flex', flexDirection: 'column' }}>
              <pre>
                {
                  JSON.stringify(clients, null, 4)
                }
              </pre>
              <input
                value={input}
                onChange={(e) => provider.doc.getMap('data').set('input', e.target.value ?? '')}
              />
              <br />
              <button onClick={() => provider.doc.getMap('data').set('input', `${Math.random()}`)}>Emit random change</button>
            </div>
        }
      </div>
    </div>
  )
}

export default App
