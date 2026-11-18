import { inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, fromEvent, NEVER, takeUntil, timeout, TimeoutError } from 'rxjs';
import { ApiLog, isRecord, Mode } from './cat.models';

export interface CurlResult { status: number; body: unknown; milliseconds: number; }
export interface VoteEntry { breedId: string; count: number; }
export interface VoteBoard { totalVotes: number; updatedAt: string; votes: VoteEntry[]; }

function errorBody(error: HttpErrorResponse): unknown {
  if (!error.status) return { message: 'Le BFF du kiosque ne répond pas.' };
  const body: unknown = error.error;
  if (isRecord(body) && !(body['error'] instanceof Error)) return body;
  return { message: typeof body === 'string' && body.trim() ? body.slice(0, 300) : error.message };
}

@Injectable({ providedIn: 'root' })
export class CatApiService {
  private readonly http = inject(HttpClient);
  readonly runtimeApiKey = signal('');
  readonly logs = signal<ApiLog[]>([]);
  readonly selectedId = signal('');

  async configuration(): Promise<{ hasApiKey: boolean; apiBase: string; prefillApiKey: string }> {
    const value = await firstValueFrom(this.http.get<unknown>('/config').pipe(timeout(15000)));
    if (!isRecord(value) || typeof value['hasApiKey'] !== 'boolean' || typeof value['apiBase'] !== 'string') {
      throw new Error('Configuration du BFF inattendue.');
    }
    return {
      hasApiKey: value['hasApiKey'],
      apiBase: value['apiBase'],
      prefillApiKey: typeof value['prefillApiKey'] === 'string' ? value['prefillApiKey'] : '',
    };
  }

  async contract(): Promise<unknown> {
    try { return await firstValueFrom(this.http.get<unknown>('/openapi.json').pipe(timeout(15000))); }
    catch (error: unknown) {
      throw error instanceof HttpErrorResponse ? new Error(`HTTP ${error.status || 'réseau'} sur /openapi.json`) : error;
    }
  }

  async readVotes(): Promise<VoteBoard> {
    const value = await firstValueFrom(this.http.get<unknown>('/vote/dsin').pipe(timeout(15000)));
    return this.parseVoteBoard(value);
  }

  async voteFor(breedId: string): Promise<VoteBoard> {
    const value = await firstValueFrom(this.http.post<unknown>(
      `/vote/dsin/${encodeURIComponent(breedId)}`, null, { headers: this.requestHeaders() },
    ).pipe(timeout(15000)));
    return this.parseVoteBoard(value);
  }

  async resetVotes(): Promise<VoteBoard> {
    const value = await firstValueFrom(this.http.delete<unknown>('/vote/dsin').pipe(timeout(15000)));
    return this.parseVoteBoard(value);
  }

  clearLogs(): void {
    this.logs.set([]);
    this.selectedId.set('');
  }

  setRuntimeApiKey(key: string): void {
    this.runtimeApiKey.set(key.trim());
  }

  clearRuntimeApiKey(): void {
    this.runtimeApiKey.set('');
  }

  /**
   * Rejoue l'appel d'un exercice curl. Contrairement à `request`, il n'alimente pas le journal « L'API à la loupe »
   * et ne lève pas sur un 4xx : le refus 403 est justement le résultat à observer.
   */
  async curl(route: string): Promise<CurlResult> {
    const started = performance.now();
    const result = (status: number, body: unknown): CurlResult => ({ status, body, milliseconds: Math.round(performance.now() - started) });
    try {
      const response = await firstValueFrom(this.http.get<unknown>(
        route, { observe: 'response', headers: this.requestHeaders() },
      ).pipe(timeout(15000)));
      return result(response.status, response.body);
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse) return result(error.status, errorBody(error));
      return result(0, { message: error instanceof TimeoutError ? 'Aucune réponse en 15 secondes.' : 'Appel impossible.' });
    }
  }

  /** Races d'exemple servies par le bac à sable avec les données simulées, à la place de TheCatAPI : aucun appel au fournisseur, rien dans le journal. */
  async demoCatalogue(): Promise<Record<string, unknown>[]> {
    const value = await firstValueFrom(this.http.get<unknown>('/demo/breeds').pipe(timeout(15000)));
    if (!Array.isArray(value)) throw new Error('Catalogue simulé inattendu.');
    return value.filter(isRecord).slice(0, 50);
  }

  async request(path: string, mode: Mode, signal: AbortSignal): Promise<unknown> {
    const id = crypto.randomUUID();
    this.logs.update((logs) => [{ id, mode, path, status: '…' }, ...logs].slice(0, 20));
    this.selectedId.set(id);
    const started = performance.now();
    try {
      if (signal.aborted) throw new DOMException('Appel annulé', 'AbortError');
      const response = await firstValueFrom(this.http.get<unknown>(
        `/${mode === 'demo' ? 'demo' : 'api'}${path}`, { observe: 'response', headers: this.requestHeaders() },
      ).pipe(timeout(15000), takeUntil(signal.aborted ? NEVER : fromEvent(signal, 'abort'))));
      this.updateLog(id, { status: response.status, body: response.body });
      return response.body;
    } catch (error: unknown) {
      if (signal.aborted) {
        this.updateLog(id, { status: 'Annulé', body: { message: 'Changement de source, de recherche ou fermeture de la fiche.' } });
        throw new DOMException('Appel annulé', 'AbortError');
      }
      if (error instanceof HttpErrorResponse) {
        const body: unknown = error.error;
        const detail = isRecord(body) && typeof body['message'] === 'string' ? body['message'] : error.message;
        this.updateLog(id, { status: error.status || 'Erreur', body: body || { message: detail } });
        throw new Error(`HTTP ${error.status || 'réseau'} — ${detail}${error.status === 403
          ? ' La clé d’accès du kiosque est absente ou refusée par le fournisseur.' : ''}`);
      }
      const message = error instanceof Error ? error.message : 'Appel impossible.';
      this.updateLog(id, { status: 'Erreur', body: { message } });
      throw error;
    } finally {
      this.updateLog(id, { milliseconds: Math.round(performance.now() - started) });
    }
  }

  private updateLog(id: string, changes: Partial<ApiLog>): void {
    this.logs.update((logs) => logs.map((log) => log.id === id ? { ...log, ...changes } : log));
  }

  private requestHeaders(): Record<string, string> | undefined {
    const key = this.runtimeApiKey();
    return key ? { 'X-Kiosque-Api-Key': key } : undefined;
  }

  private parseVoteBoard(value: unknown): VoteBoard {
    if (!isRecord(value) || typeof value['totalVotes'] !== 'number' || typeof value['updatedAt'] !== 'string' || !Array.isArray(value['votes'])) {
      throw new Error('Réponse de vote inattendue.');
    }
    const votes = value['votes'].map((item): VoteEntry => {
      if (!isRecord(item) || typeof item['breedId'] !== 'string' || typeof item['count'] !== 'number') {
        throw new Error('Réponse de vote inattendue.');
      }
      return { breedId: item['breedId'], count: item['count'] };
    });
    return { totalVotes: value['totalVotes'], updatedAt: value['updatedAt'], votes };
  }
}
