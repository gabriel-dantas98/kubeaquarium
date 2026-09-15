import type { DeleteAccepted, PodView } from './types';
export interface PodOperations { deletePod(pod: PodView): Promise<DeleteAccepted> }
export class ApiDeleteError extends Error { constructor(public status: number, message: string) { super(message); this.name = 'ApiDeleteError'; } }
export class LivePodOperations implements PodOperations {
  async deletePod(pod: PodView): Promise<DeleteAccepted> {
    const path = `/api/pod/${encodeURIComponent(pod.namespace)}/${encodeURIComponent(pod.name)}`;
    const response = await fetch(`${path}?uid=${encodeURIComponent(pod.uid)}`, { method: 'DELETE' });
    if (!response.ok) throw new ApiDeleteError(response.status, await response.text());
    const result = await response.json() as DeleteAccepted;
    if (result.accepted !== true || result.uid !== pod.uid) throw new Error('Unexpected DELETE response');
    return result;
  }
}
