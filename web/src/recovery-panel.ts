import type { RecoveryOperation } from './recovery';
export class RecoveryPanel {
  private expanded = false;
  private signature = '';
  constructor(
    private root: HTMLElement,
    private onFocus: (uid: string) => void = () => {},
    private onDismiss: (id: string) => void = () => {},
    private podExists: (uid: string) => boolean = () => true,
  ) {
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
  }
  render(operations: readonly RecoveryOperation[]) {
    const signature = `${this.expanded}:${operations.map(o => `${o.id}:${o.phase}:${o.message}:${o.candidateUid ?? ''}`).join('|')}`;
    if (signature === this.signature) return;
    this.signature = signature;
    this.root.replaceChildren(); const visible = this.expanded ? operations : operations.slice(-5);
    for (const operation of visible) {
      const card = document.createElement('article');
      card.dataset.operationPhase = operation.phase;
      card.dataset.targetUid = operation.target.uid;
      if (operation.candidateUid) card.dataset.candidateUid = operation.candidateUid;

      const title = document.createElement('strong');
      title.textContent = `${operation.target.namespace}/${operation.target.name}`;
      const message = document.createElement('p');
      message.textContent = operation.message;
      card.append(title, message);

      if (operation.candidateUid) {
        const focus = document.createElement('button');
        focus.type = 'button';
        focus.textContent = 'Focus pod';
        focus.disabled = !this.podExists(operation.candidateUid);
        focus.onclick = () => this.onFocus(operation.candidateUid!);
        card.append(focus);
      }

      const dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.textContent = 'Dismiss';
      dismiss.onclick = () => this.onDismiss(operation.id);
      card.append(dismiss);
      this.root.append(card);
    }
    if(operations.length>5){const more=document.createElement('button');more.type='button';more.textContent=this.expanded?'Show fewer':`Show ${operations.length-5} more`;more.onclick=()=>{this.expanded=!this.expanded;this.signature='';this.render(operations)};this.root.append(more)}
  }
}
