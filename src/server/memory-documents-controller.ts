import { DocumentsController } from "./y-socket-io";
import { Document } from "./document";

export class MemoryDocumentsController implements DocumentsController {
  /**
   * Provides an in-memory storage for documents and implements the methods defined in the interface.
   */
  private readonly _documents: Map<string, Document> = new Map();

  /**
   * Retrieves a document with the specified name from the in-memory storage.
   * @param name - The name of the document to retrieve.
   * @returns A promise that resolves to the document object if found, or `undefined` if not found.
   */
  get(name: string): Promise<Document | undefined> {
    return Promise.resolve(this._documents.get(name));
  }

  /**
   * Sets a document with the specified name in the in-memory storage.
   * @param name - The name of the document to set.
   * @param doc - The document object to set.
   * @returns A promise that resolves when the document is successfully set.
   */
  set(name: string, doc: Document): Promise<void> {
    this._documents.set(name, doc);
    return Promise.resolve();
  }

  /**
   * Deletes a document with the specified name from the in-memory storage.
   * @param name - The name of the document to delete.
   * @returns A promise that resolves when the document is successfully deleted.
   */
  delete(name: string): Promise<void> {
    this._documents.delete(name);
    return Promise.resolve();
  }

  /**
   * Checks if a document with the specified name exists in the in-memory storage.
   * @param name - The name of the document to check.
   * @returns A promise that resolves to `true` if the document exists, or `false` if not.
   */
  has(name: string): Promise<boolean> {
    return Promise.resolve(this._documents.has(name));
  }

  /**
   * Retrieves all documents from the in-memory storage.
   * @returns A promise that resolves to a `Map` object containing all the documents,
   * where the keys are the document names and the values are the document objects.
   */
  getAll(): Promise<Map<string, Document>> {
    return Promise.resolve(this._documents);
  }
}
