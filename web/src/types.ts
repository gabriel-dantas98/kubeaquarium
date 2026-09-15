export interface ControllerView { apiVersion: string; kind: string; name: string; uid: string }
export interface DeleteAccepted { accepted: true; uid: string }

export interface PodView {
  uid: string;
  name: string;
  namespace: string;
  node: string;
  phase: string;
  ready: boolean;
  restartCount: number;
  reason: string;
  cpuMillis: number;
  memMib: number;
  createdAt: string;
  controller: ControllerView | null;
  deletionTimestamp: string;
}

export type StreamEvent =
  | { type: 'snapshot'; pods: PodView[] }
  | { type: 'added'; pod: PodView }
  | { type: 'updated'; pod: PodView }
  | { type: 'deleted'; uid: string };
