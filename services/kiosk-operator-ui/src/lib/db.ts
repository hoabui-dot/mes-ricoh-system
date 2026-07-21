import { openDB, DBSchema } from 'idb';

interface KioskDBSchema extends DBSchema {
  work_orders: {
    key: string;
    value: {
      wo_id: string;
      wo_code: string;
      item_code: string;
      item_name?: string;
      quantity: number;
      status: string;
      updated_at: string;
      cached_at: string;
    };
    indexes: { 'by-code': string };
  };
  operations: {
    key: string;
    value: {
      wo_operation_id: string;
      wo_id: string;
      operation_code: string;
      sequence_no: number;
      status: string;
      cached_at: string;
    };
    indexes: { 'by-wo': string };
  };
}

const DB_NAME = 'kiosk-offline-db';
const DB_VERSION = 1;

export async function getKioskDB() {
  return openDB<KioskDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('work_orders')) {
        const woStore = db.createObjectStore('work_orders', { keyPath: 'wo_id' });
        woStore.createIndex('by-code', 'wo_code');
      }
      if (!db.objectStoreNames.contains('operations')) {
        const opStore = db.createObjectStore('operations', { keyPath: 'wo_operation_id' });
        opStore.createIndex('by-wo', 'wo_id');
      }
    },
  });
}

export async function cacheWorkOrders(wos: any[]) {
  try {
    const db = await getKioskDB();
    const tx = db.transaction('work_orders', 'readwrite');
    const now = new Date().toISOString();
    for (const wo of wos) {
      await tx.store.put({
        wo_id: wo.wo_id,
        wo_code: wo.wo_code,
        item_code: wo.item_code,
        item_name: wo.item_name,
        quantity: wo.quantity,
        status: wo.status,
        updated_at: wo.created_at || now,
        cached_at: now,
      });
    }
    await tx.done;
  } catch (err) {
    console.warn('[IndexedDB] Failed to cache WOs:', err);
  }
}

export async function getCachedWorkOrders() {
  try {
    const db = await getKioskDB();
    return await db.getAll('work_orders');
  } catch (err) {
    console.warn('[IndexedDB] Failed to read cached WOs:', err);
    return [];
  }
}
