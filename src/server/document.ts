import * as Y from 'yjs'
import { Namespace, Socket } from 'socket.io'
import * as AwarenessProtocol from 'y-protocols/awareness'
import { AwarenessChange } from '../types'

const gcEnabled = process.env.GC !== 'false' && process.env.GC !== '0'

/**
 * Document callbacks. Here you can set:
 * - onUpdate: Set a callback that will be triggered when the document is updated
 * - onChangeAwareness: Set a callback that will be triggered when the awareness is updated
 * - onDestroy: Set a callback that will be triggered when the document is destroyed
 */
export interface Callbacks {
  /**
   * Set a callback that will be triggered when the document is updated
   */
  onUpdate?: (doc: Document, docUpdate: Uint8Array) => void
  /**
   * Set a callback that will be triggered when the awareness is updated
   */
  onChangeAwareness?: (doc: Document, awarenessUpdate: Uint8Array) => void
  /**
   * Set a callback that will be triggered when the document is destroyed
   */
  onDestroy?: (doc: Document) => Promise<void>
}

/**
 * YSocketIO document
 */
export class Document extends Y.Doc {
  /**
   * The document name
   * @type {string}
   */
  public name: string
  /**
   * The namespace connection
   * @type {Namespace}
   * @private
   */
  private readonly namespace: Namespace
  /**
   * Indicator as to whether to send document updates only to local WebSockets
   * @type {boolean}
   * @private
   */
  private readonly localOnly?: boolean
  /**
   * The document awareness
   * @type {Awareness}
   */
  public awareness: AwarenessProtocol.Awareness
  /**
   * The document callbacks
   * @type {Callbacks}
   * @private
   */
  private readonly callbacks?: Callbacks

  /**
   * Document constructor.
   * @constructor
   * @param {string} name Name for the document
   * @param {Namespace} namespace The namespace connection
   * @param {boolean} localOnly Indicator as to whether to send document updates only to local WebSockets
   * @param {Callbacks} callbacks The document callbacks
   */
  constructor (name: string, namespace: Namespace, localOnly?: boolean, callbacks?: Callbacks) {
    super({ gc: gcEnabled })
    this.name = name
    this.namespace = namespace
    this.localOnly = localOnly
    this.awareness = new AwarenessProtocol.Awareness(this)
    this.awareness.setLocalState(null)
    this.callbacks = callbacks

    this.awareness.on('update', this.onUpdateAwareness)

    this.on('update', this.onUpdateDoc)
  }

  /**
   * Handles the document's update and emit eht changes to clients.
   * @type {(update: Uint8Array) => void}
   * @param {Uint8Array} update
   * @private
   */
  private readonly onUpdateDoc = (update: Uint8Array): void => {
    if ((this.callbacks?.onUpdate) != null) {
      try {
        this.callbacks.onUpdate(this, update)
      } catch (error) {
        console.warn(error)
      }
    }
    if (this.localOnly !== undefined && this.localOnly) {
      this.namespace.local.emit('sync-update', update)
    } else {
      this.namespace.emit('sync-update', update)
    }
  }

  /**
   * Handles the awareness update and emit the changes to clients.
   * @type {({ added, updated, removed }: { added: number[], updated: number[], removed: number[] }, _socket: Socket | null) => void}
   * @param {AwarenessChange} awarenessChange
   * @param {Socket | null} _socket
   * @private
   */
  private readonly onUpdateAwareness = ({ added, updated, removed }: AwarenessChange, _socket: Socket | null): void => {
    const changedClients = added.concat(updated, removed)
    const update = AwarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
    if ((this.callbacks?.onChangeAwareness) != null) {
      try {
        this.callbacks.onChangeAwareness(this, update)
      } catch (error) {
        console.warn(error)
      }
    }
    this.namespace.emit('awareness-update', update)
  }

  /**
   * Destroy the document and remove the listeners.
   * @type {() => Promise<void>}
   */
  public async destroy (): Promise<void> {
    if ((this.callbacks?.onDestroy) != null) {
      try {
        await this.callbacks.onDestroy(this)
      } catch (error) {
        console.warn(error)
      }
    }
    this.awareness.off('update', this.onUpdateAwareness)
    this.off('update', this.onUpdateDoc)
    this.namespace.disconnectSockets()
    super.destroy()
  }
}
