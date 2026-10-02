import { apiUrl } from '../../apiConfig';
import { apiFetch } from '../../session';

export type TableCapability = 'leave' | 'rebuy' | 'borrow';

/** Never wait for an acknowledgement from a backend that cannot send it. */
export async function assertTableProtocolCapability(capability: TableCapability): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await apiFetch(apiUrl('/api/version'), {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('The table server could not be checked. Please reconnect and try again.');
    const data = await response.json();
    if (data?.tableProtocol?.version !== 1 || data.tableProtocol[capability] !== true) {
      throw new Error('The table server needs an update before it can confirm this action. Your chips have not been changed. Please try again after the server is updated.');
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('The table server did not respond. Please reconnect and try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}