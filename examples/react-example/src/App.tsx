import * as Y from 'yjs';
import { useEffect, useState } from 'react';
import { SocketIOProvider } from 'y-socket.io';

function App() {
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [provider, setProvider] = useState<SocketIOProvider | null>(null);
  const [status, setStatus] = useState<string>('disconnected');
  const [input, setInput] = useState<string>('');
  const [clients, setClients] = useState<string[]>([]);

  useEffect(() => {
    if (!doc) {
      console.log('setting doc')
      const _doc = new Y.Doc();
      const yMap = _doc.getMap('data');
      if (!yMap.has('input')) {
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
      socketIOProvider.on('sync', (isSync: boolean) => console.log('websocket sync', isSync))
      socketIOProvider.on('status', ({ status: _status }: { status: string }) => {
        if (!!_status) setStatus(_status);
      })
      setProvider(socketIOProvider);
    }
  }, [doc, provider]);

  if (!provider) return <h1>Initializing provider...</h1>;

  const onChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    if (!doc) return;
    const yMap = doc.getMap('data');
    yMap.set('input', e.target.value ?? '')
  }

  return (
    <div>
      App
      <div style={{ color: 'white' }}>
        <p>State: {status}</p>
        {
          !(status === 'connected')
            ? <>
              <button onClick={() => provider.connect()}>Connect</button>
            </>
            : !!doc && <div style={{ display: 'flex', flexDirection: 'column' }}>
              <pre>
                {JSON.stringify(clients, null, 4)}
              </pre>
              <input
                value={input}
                onChange={onChange}
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
