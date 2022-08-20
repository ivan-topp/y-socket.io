import { Doc } from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { Namespace, Socket } from 'socket.io';
import * as AwarenessProtocol from 'y-protocols/awareness';

const gcEnabled = process.env.GC !== 'false' && process.env.GC !== '0';
// TODO: Documentation
export interface AwarenessChange {
    /**
     * The clients added
     */
    added: number[];
    /**
     * The clients updated
     */
    updated: number[];
    /**
     * The clients removed
     */
    removed: number[];
}
// TODO: Documentation
export interface Callbacks {
    /**
     * Set a callback that will be triggered when the document is updated
     */
    onUpdate?: (doc: Document, docUpdate: Uint8Array) => Promise<void> | void,
    /**
     * Set a callback that will be triggered when the awareness is updated
     */
    onChangeAwareness?: (doc: Document, awarenessUpdate: Uint8Array) => Promise<void> | void,
    /**
     * Set a callback that will be triggered when the document is destroyed
     */
    onDestroy?: (doc: Document) => Promise<void> | void,
}
// TODO: Documentation
export class Document extends Doc {
    /**
     * The document name
     * @type {string}
     */
    public name: string;
    /**
     * The socket connection
     * @type {Namespace}
     * @private
     */
    private namespace: Namespace;
    /**
     * The document awareness
     * @type {Awareness}
     */
    public awareness: Awareness;
    /**
     * The document callbacks
     * @type {Callbacks}
     * @private
     */
    private callbacks?: Callbacks;

    /**
     * Document constructor.
     * @constructor
     * @param {string} name Name for the document
     * @param {Namespace} namespace The namespace connection
     * @param {Callbacks} callbacks The document callbacks
     */
    constructor(name: string, namespace: Namespace, callbacks?: Callbacks) {
        super({ gc: gcEnabled });
        this.name = name;
        this.namespace = namespace;
        this.awareness = new Awareness(this);
        this.awareness.setLocalState(null);
        this.callbacks = callbacks;

        this.awareness.on('update', this.onUpdateAwareness);

        this.on('update', this.onUpdateDoc);
    }

    /**
     * Handles the document's update and emit eht changes to clients.
     * @type {(update: Uint8Array) => void}
     * @param {Uint8Array} update
     * @private
     */
    private onUpdateDoc = (update: Uint8Array) => {
        if (!!this.callbacks?.onUpdate) {
            try {
                this.callbacks.onUpdate(this, update);
            } catch (error) {
                console.log(error);
            }
        }
        this.namespace.emit('sync-update', update);
    }

    /**
     * Handles the awareness update and emit the changes to clients.
     * @type {({ added, updated, removed }: { added: number[], updated: number[], removed: number[] }, _socket: Socket | null) => void}
     * @param {AwarenessChange} awarenessChange
     * @param {Socket | null} _socket
     * @private
     */
    private onUpdateAwareness = ({ added, updated, removed }: AwarenessChange, _socket: Socket | null): void => {
        const changedClients = added.concat(updated, removed);
        const update = AwarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients);
        if (!!this.callbacks?.onChangeAwareness) {
            try {
                this.callbacks.onChangeAwareness(this, update);
            } catch (error) {
                console.log(error);
            }
        }
        this.namespace.emit('awareness-update', update);
    }
    
    /**
     * Destroy the document and remove the listeners.
     * @type {() => Promise<void>}
     */
    public async destroy(): Promise<void> {
        if (!!this.callbacks?.onDestroy) {
            try {
                await this.callbacks.onDestroy(this);
            } catch (error) {
                console.log(error);
            }
        }
        this.awareness.off('update', this.onUpdateAwareness);
        this.off('update', this.onUpdateDoc);
        this.namespace.disconnectSockets();
        super.destroy();
    }

}