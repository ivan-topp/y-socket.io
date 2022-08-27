import * as Y from 'yjs';
import { useEffect, useState } from 'react';
import { SocketIOProvider } from 'y-socketio';

function App() {
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [provider, setProvider] = useState<SocketIOProvider | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [input, setInput] = useState<string>('');
  const [clients, setClients] = useState<string[]>([]);

  useEffect(() => {
    if (!doc) {
      console.log('setting doc')
      const _doc = new Y.Doc();
      const yMap = _doc.getMap('data');
      if (!yMap.has('input')) {
        yMap.set('input', '');
        yMap.observe((event, transaction) => {
          setInput(yMap.get('input') as string);
        });
      }
      setDoc(_doc);
    }
  }, [doc]);

  useEffect(() => {
    if (!!doc && !provider) {
      console.log('setting providers')
      const socketIOProvider = new SocketIOProvider(
        'ws://localhost:1234',
        'testing-doc',
        doc,
        {
          autoConnect: true,
          // disableBc: true,
          // auth: { token: 'valid-token' },
        });
      socketIOProvider.awareness.on('change', () => setClients(Array.from(socketIOProvider.awareness.getStates().keys()).map(key => `${key}`)))
      socketIOProvider.awareness.setLocalState({ id: Math.random(), name: 'Perico' });
      socketIOProvider.on('sync', (status: boolean) => console.log('websocket sync', status))
      socketIOProvider.on('status', ({ status }: { status: string }) => {
        if (status === 'connected') setConnected(true);
        else setConnected(false);
      })
      setProvider(socketIOProvider);
    }
  }, [doc, provider]);

  if (!provider) return <h1>Initializing provider...</h1>;

  return (
    <div>
      App
      <div style={{ color: 'white' }}>
        <p>State: {connected ? 'Connected' : 'Disconneted'}</p>
        {
          !connected
            ? <>
              <button onClick={() => provider.connect()}>Connect</button>
            </>
            : !!doc &&<div style={{ display: 'flex', flexDirection: 'column' }}>
              <pre>
                { JSON.stringify(clients, null, 4) }
              </pre>
              <input
                value={input}
                onChange={(e) => doc.getMap('data').set('input', e.target.value ?? '')}
              />
              <br />
              <button onClick={() => doc.getMap('data').set('input', `${Math.random()}`)}>Emit random change</button>
            </div>
        }
      </div>
    </div>
  )
}

export default App
