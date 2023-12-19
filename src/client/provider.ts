import * as Y from 'yjs'
import * as bc from 'lib0/broadcastchannel'
import * as AwarenessProtocol from 'y-protocols/awareness'
import { Observable } from 'lib0/observable'
import { io, ManagerOptions, Socket, SocketOptions } from 'socket.io-client'
import { AwarenessChange } from '../types'

/**
 * SocketIOProvider instance configuration. Here you can configure:
 * - autoConnect: (Optional) Will try to connect to the server when the instance is created if true; otherwise you have to call `provider.connect()` manually
 * - awareness: (Optional) Give an existing awareness
 * - resyncInterval: (Optional) Specify the number of milliseconds to set an interval to synchronize the document,
 *   if it is greater than 0 enable the synchronization interval (by default is -1)
 * - disableBc: (Optional) This boolean disable the broadcast channel functionality, by default is false (broadcast channel enabled)
 * - onConnect: (Optional) Set a callback that will triggered immediately when the socket is connected
 * - onDisconnect: (Optional) Set a callback that will triggered immediately when the socket is disconnected
 * - onConnectError: (Optional) Set a callback that will triggered immediately when the occurs a socket connection error
 */
export interface ProviderConfiguration {
  /**
   * (Optional) This boolean specify if the provider should connect when the instance is created, by default is true
   */
  autoConnect?: boolean
  /**
   * (Optional) An existent awareness, by default is a new AwarenessProtocol.Awareness instance
   */
  awareness?: AwarenessProtocol.Awareness
  /**
   * (optional) Specify the number of milliseconds to synchronize, by default is -1 (this disable resync interval)
   */
  resyncInterval?: number
  /**
   * (Optional) This boolean disable the broadcast channel functionality, by default is false (broadcast channel enabled)
   */
  disableBc?: boolean
  /**
   * (Optional) Add the authentication data
   */
  auth?: { [key: string]: any }
  /**
   * The time over which to debounce document updates before syncing
   */
  debounceTime?: number
  /**
   * Notify pending state when debouncing
   */
  onPending?: (pending: boolean) => void
}

/**
 * The socket io provider class to sync a document
 */
export class SocketIOProvider extends Observable<string> {
  /**
   * The connection url to server. Example: `ws://localhost:3001`
   * @type {string}
   */
  private readonly _url: string
  /**
   * The name of the document room
   * @type {string}
   */
  public roomName: string
  /**
   * The broadcast channel room
   * @type {string}
   * @private
   */
  private readonly _broadcastChannel: string
  /**
   * The socket connection
   * @type {Socket}
   */
  public socket: Socket
  /**
   * The time over which to debounce document updates before syncing
   * @type {number}
   * @private
   */
  public readonly debounceTime?: number
  /**
   * The timer used to debounce document updates
   * @type {ReturnType<typeof setTimeout>}
   * @private
   */
  private updateTimer?: ReturnType<typeof setTimeout>
  /**
   * Notify pending state when debouncing
   * @type {((pending: boolean) => void) | undefined}
   */
  public onPending: ((pending: boolean) => void) | undefined
  /**
   * The pending debouncing updates
   * @type {Uint8Array[]}
   * @private
   */
  private pendingUpdates: Uint8Array[]
  /**
   * The yjs document
   * @type {Y.Doc}
   */
  public doc: Y.Doc
  /**
   * The awareness
   * @type {AwarenessProtocol.Awareness}
   */
  public awareness: AwarenessProtocol.Awareness
  /**
   * Disable broadcast channel, by default is false
   * @type {boolean}
   */
  public disableBc: boolean
  /**
   * The broadcast channel connection status indicator
   * @type {boolean}
   */
  public bcconnected: boolean = false
  /**
   * The document's sync status indicator
   * @type {boolean}
   * @private
   */
  private _synced: boolean = false
  /**
   * Interval to emit `sync-step-1` to sync changes
   * @type {ReturnType<typeof setTimeout> | null}
   * @private
   */
  private resyncInterval: ReturnType<typeof setTimeout> | null = null
  /**
   * Optional overrides for socket.io
   * @type {Partial<ManagerOptions & SocketOptions> | undefined}
   * @private
   */
  private readonly _socketIoOptions: Partial<ManagerOptions & SocketOptions> | undefined

  /**
   * SocketIOProvider constructor
   * @constructor
   * @param {string} url The connection url from server
   * @param {string} roomName The document's room name
   * @param {Y.Doc} doc The yjs document
   * @param {ProviderConfiguration} options Configuration options to the SocketIOProvider
   * @param {Partial<ManagerOptions & SocketOptions> | undefined} socketIoOptions optional overrides for socket.io
   */
  constructor (url: string, roomName: string, doc: Y.Doc = new Y.Doc(), {
    autoConnect = true,
    awareness = new AwarenessProtocol.Awareness(doc),
    resyncInterval = -1,
    disableBc = false,
    auth = {},
    debounceTime,
    onPending
  }: ProviderConfiguration,
  socketIoOptions: Partial<ManagerOptions & SocketOptions> | undefined = undefined) {
    super()
    while (url[url.length - 1] === '/') {
      url = url.slice(0, url.length - 1)
    }
    this._url = url
    this.roomName = roomName
    this.doc = doc
    this.awareness = awareness

    this._broadcastChannel = `${url}/${roomName}`
    this.disableBc = disableBc
    this._socketIoOptions = socketIoOptions

    this.socket = io(`${this.url}/yjs|${roomName}`, {
      autoConnect: false,
      transports: ['websocket'],
      forceNew: true,
      auth: auth,
      ...socketIoOptions
    })
    this.debounceTime = debounceTime
    this.onPending = onPending
    this.pendingUpdates = []

    this.doc.on('update', this.onUpdateDoc)

    this.socket.on('connect', () => this.onSocketConnection(resyncInterval))

    this.socket.on('disconnect', (event) => this.onSocketDisconnection(event))

    this.socket.on('connect_error', (error) => this.onSocketConnectionError(error))

    this.initSyncListeners()

    this.initAwarenessListeners()

    this.initSystemListeners()

    awareness.on('update', this.awarenessUpdate)

    if (autoConnect) this.connect()
  }

  /**
   * Broadcast channel room getter
   * @type {string}
   */
  public get broadcastChannel (): string {
    return this._broadcastChannel
  }

  /**
   * URL getter
   * @type {string}
   */
  public get url (): string {
    return this._url
  }

  /**
   * Synchronized state flag getter
   * @type {boolean}
   */
  public get synced (): boolean {
    return this._synced
  }

  /**
   * Synchronized state flag setter
   */
  public set synced (state) {
    if (this._synced !== state) {
      this._synced = state
      this.emit('synced', [state])
      this.emit('sync', [state])
    }
  }

  /**
   * This function initializes the socket event listeners to synchronize document changes.
   *
   *  The synchronization protocol is as follows:
   *  - A server emits the sync step one event (`sync-step-1`) which sends the document as a state vector
   *    and the sync step two callback as an acknowledgment according to the socket io acknowledgments.
   *  - When the client receives the `sync-step-1` event, it executes the `syncStep2` acknowledgment callback and sends
   *    the difference between the received state vector and the local document (this difference is called an update).
   *  - The second step of the sync is to apply the update sent in the `syncStep2` callback parameters from the client
   *    to the document on the server side.
   *  - There is another event (`sync-update`) that is emitted from the server, which sends an update for the document,
   *    and when the client receives this event, it applies the received update to the local document.
   *  - When an update is applied to a document, it will fire the document's "update" event, which
   *    sends the update to the server.
   * @type {() => void}
   * @private
   */
  private readonly initSyncListeners = (): void => {
    this.socket.on('sync-step-1', (stateVector: ArrayBuffer, syncStep2: (update: Uint8Array) => void) => {
      syncStep2(Y.encodeStateAsUpdate(this.doc, new Uint8Array(stateVector)))
      this.synced = true
    })

    this.socket.on('sync-update', this.onSocketSyncUpdate)
  }

  /**
   * This function initializes socket event listeners to synchronize awareness changes.
   *
   *  The awareness protocol is as follows:
   *  - The server emits the `awareness-update` event by sending the awareness update.
   *  - The client receives that event and applies the received update to the local awareness.
   *  - When an update is applied to awareness, the awareness "update" event will fire, which
   *    sends the update to the server.
   * @type {() => void}
   * @private
   */
  private readonly initAwarenessListeners = (): void => {
    this.socket.on('awareness-update', (update: ArrayBuffer) => {
      AwarenessProtocol.applyAwarenessUpdate(this.awareness, new Uint8Array(update), this)
    })
  }

  /**
   * This function initialize the window or process events listener. Specifically set ups the
   * window `beforeunload` and process `exit` events to remove the client from the awareness.
   * @type {() => void}
   */
  private readonly initSystemListeners = (): void => {
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', this.beforeUnloadHandler)
    else if (typeof process !== 'undefined') process.on('exit', this.beforeUnloadHandler)
  }

  /**
   * Connect provider's socket
   * @type {() => void}
   */
  public connect (): void {
    if (!this.socket.connected) {
      this.emit('status', [{ status: 'connecting' }])
      this.socket.connect()
      if (!this.disableBc) this.connectBc()
      this.synced = false
    }
  }

  /**
   * This function runs when the socket connects and reconnects and emits the `sync-step-1`
   * and `awareness-update` socket events to start synchronization.
   *
   *  Also starts the resync interval if is enabled.
   * @private
   * @param {() => void | Promise<void>} onConnect (Optional) A callback that will be triggered every time that socket is connected or reconnected
   * @param {number} resyncInterval (Optional) A number of milliseconds for interval of synchronize
   * @type {(onConnect: () => void | Promise<void>, resyncInterval: number = -1) => void}
   */
  private readonly onSocketConnection = (resyncInterval: ProviderConfiguration['resyncInterval'] = -1): void => {
    this.emit('status', [{ status: 'connected' }])
    this.socket.emit('sync-step-1', Y.encodeStateVector(this.doc), (update: Uint8Array) => {
      Y.applyUpdate(this.doc, new Uint8Array(update), this)
    })
    if (this.awareness.getLocalState() !== null) this.socket.emit('awareness-update', AwarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID]))
    if (resyncInterval > 0) {
      this.resyncInterval = setInterval(() => {
        if (this.socket.disconnected) return
        this.socket.emit('sync-step-1', Y.encodeStateVector(this.doc), (update: Uint8Array) => {
          Y.applyUpdate(this.doc, new Uint8Array(update), this)
        })
      }, resyncInterval)
    }
  }

  /**
   * Disconnect provider's socket
   * @type {() => void}
   */
  public disconnect (): void {
    if (this.socket.connected) {
      this.disconnectBc()
      this.socket.disconnect()
    }
  }

  /**
   * This function runs when the socket is disconnected and emits the socket event `awareness-update`
   * which removes this client from awareness.
   * @private
   * @param {Socket.DisconnectReason} event The reason of the socket disconnection
   * @param {() => void | Promise<void>} onDisconnect (Optional) A callback that will be triggered every time that socket is disconnected
   * @type {(event: Socket.DisconnectReason, onDisconnect: () => void | Promise<void>) => void}
   */
  private readonly onSocketDisconnection = (event: Socket.DisconnectReason): void => {
    this.emit('connection-close', [event, this])
    this.synced = false
    AwarenessProtocol.removeAwarenessStates(this.awareness, Array.from(this.awareness.getStates().keys()).filter(client => client !== this.doc.clientID), this)
    this.emit('status', [{ status: 'disconnected' }])
  }

  /**
   * This function is executed when the socket connection fails.
   * @param {Error} error The error in the connection
   * @param {(error: Error) => void | Promise<void>} onConnectError (Optional) A callback that will be triggered every time that socket has a connection error
   * @type {(error: Error, onConnectError: (error: Error) => void | Promise<void>) => void}
   */
  private readonly onSocketConnectionError = (error: Error): void => {
    this.emit('connection-error', [error, this])
  }

  /**
   * Destroy the provider. This method clears the document, awareness, and window/process listeners and disconnects the socket.
   * @type {() => void}
   */
  public destroy (): void {
    if (this.resyncInterval != null) clearInterval(this.resyncInterval)
    this.disconnect()
    if (typeof window !== 'undefined') window.removeEventListener('beforeunload', this.beforeUnloadHandler)
    else if (typeof process !== 'undefined') process.off('exit', this.beforeUnloadHandler)
    this.awareness.off('update', this.awarenessUpdate)
    this.awareness.destroy()
    this.doc.off('update', this.onUpdateDoc)
    super.destroy()
  }

  private readonly onUpdateDocInner = (update: Uint8Array, origin: SocketIOProvider): void => {
    this.socket.emit('sync-update', update)
    if (this.bcconnected) {
      bc.publish(this._broadcastChannel, {
        type: 'sync-update',
        data: update
      }, this)
    }
  }

  /**
   * This function is executed when the document is updated, if the instance that
   * emit the change is not this, it emit the changes by socket and broadcast channel.
   * @private
   * @param {Uint8Array} update Document update
   * @param {SocketIOProvider} origin The SocketIOProvider instance that emits the change.
   * @type {(update: Uint8Array, origin: SocketIOProvider) => void}
   */
  private readonly onUpdateDoc = (update: Uint8Array, origin: SocketIOProvider): void => {
    if (origin === this) {
      return
    }
    if (this.debounceTime !== undefined) {
      this.onUpdateDocInner(update, origin)
    }
    if (this.updateTimer !== undefined) {
      this.onPending?.(true)
      this.pendingUpdates.push(update)
      clearTimeout(this.updateTimer)
    } else {
      this.pendingUpdates = [update]
    }
    this.updateTimer = setTimeout(() => {
      const mergedUpdate = Y.mergeUpdates(this.pendingUpdates)
      this.onUpdateDocInner(mergedUpdate, origin)
      this.onPending?.(false)
      this.updateTimer = undefined
    }, this.debounceTime)
  }

  /**
   * This function is called when the server emits the `sync-update` event and applies the received update to the local document.
   * @private
   * @param {Uint8Array}update A document update received by the `sync-update` socket event
   * @type {(update: Uint8Array) => void}
   */
  private readonly onSocketSyncUpdate = (update: ArrayBuffer): void => {
    Y.applyUpdate(this.doc, new Uint8Array(update), this)
  }

  /**
   * This function is executed when the local awareness changes and this broadcasts the changes per socket and broadcast channel.
   * @private
   * @param {{ added: number[], updated: number[], removed: number[] }} awarenessChanges The clients added, updated and removed
   * @param {SocketIOProvider | null} origin The SocketIOProvider instance that emits the change.
   * @type {({ added, updated, removed }: { added: number[], updated: number[], removed: number[] }, origin: SocketIOProvider | null) => void}
   */
  private readonly awarenessUpdate = ({ added, updated, removed }: AwarenessChange, origin: SocketIOProvider | null): void => {
    const changedClients = added.concat(updated).concat(removed)
    this.socket.emit('awareness-update', AwarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients))
    if (this.bcconnected) {
      bc.publish(this._broadcastChannel, {
        type: 'awareness-update',
        data: AwarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
      }, this)
    }
  }

  /**
   * This function is executed when the windows will be unloaded or the process will be closed and this
   * will remove the local client from awareness.
   * @private
   * @type {() => void}
   */
  private readonly beforeUnloadHandler = (): void => {
    AwarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], 'window unload')
  }

  /**
   * This function subscribes the provider to the broadcast channel and initiates synchronization by broadcast channel.
   * @type {() => void}
   */
  private readonly connectBc = (): void => {
    if (!this.bcconnected) {
      bc.subscribe(this._broadcastChannel, this.onBroadcastChannelMessage)
      this.bcconnected = true
    }
    bc.publish(this._broadcastChannel, { type: 'sync-step-1', data: Y.encodeStateVector(this.doc) }, this)
    bc.publish(this._broadcastChannel, { type: 'sync-step-2', data: Y.encodeStateAsUpdate(this.doc) }, this)
    bc.publish(this._broadcastChannel, { type: 'query-awareness', data: null }, this)
    bc.publish(this._broadcastChannel, { type: 'awareness-update', data: AwarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID]) }, this)
  }

  /**
   * This function unsubscribes the provider from the broadcast channel and before unsubscribing, updates the awareness.
   * @type {() => void}
   */
  private readonly disconnectBc = (): void => {
    bc.publish(this._broadcastChannel, {
      type: 'awareness-update',
      data: AwarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID], new Map())
    }, this)
    if (this.bcconnected) {
      bc.unsubscribe(this._broadcastChannel, this.onBroadcastChannelMessage)
      this.bcconnected = false
    }
  }

  /**
   * This method handles messages received by the broadcast channel and responds to them.
   * @param {{ type: string, data: any }} message The object message received by broadcast channel
   * @param {SocketIOProvider} origin The SocketIOProvider instance that emits the change
   * @type {(message: { type: string, data: any }, origin: SocketIOProvider) => void}
   */
  private readonly onBroadcastChannelMessage = (message: { type: string, data: any }, origin: SocketIOProvider): void => {
    if (origin !== this && message.type.length > 0) {
      switch (message.type) {
        case 'sync-step-1':
          bc.publish(this._broadcastChannel, {
            type: 'sync-step-2',
            data: Y.encodeStateAsUpdate(this.doc, message.data)
          }, this)
          break

        case 'sync-step-2':
          Y.applyUpdate(this.doc, new Uint8Array(message.data), this)
          break

        case 'sync-update':
          Y.applyUpdate(this.doc, new Uint8Array(message.data), this)
          break

        case 'query-awareness':
          bc.publish(this._broadcastChannel, {
            type: 'awareness-update',
            data: AwarenessProtocol.encodeAwarenessUpdate(this.awareness, Array.from(this.awareness.getStates().keys()))
          }, this)
          break

        case 'awareness-update':
          AwarenessProtocol.applyAwarenessUpdate(this.awareness, new Uint8Array(message.data), this)
          break

        default:
          break
      }
    }
  }
}
