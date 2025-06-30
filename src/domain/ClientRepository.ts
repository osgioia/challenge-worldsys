import { Client } from './Client';

export interface ClientRepository {
    save(client: Client): Promise<void>;
    saveBatch(clients: Client[], fileName: string): Promise<void>;
    getById(id: string): Promise<Client | null>;
    getAll(): Promise<Client[]>;
    exists(id: string): Promise<boolean>;
    existIds(ids: string[]): Promise<string[]>;
}