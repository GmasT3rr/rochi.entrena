import { MinimumLoading } from './minimum-loading';
describe('MinimumLoading', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  for (const duration of [100, 500, 750, 2000]) {
    it('mantiene el skeleton max(750, ' + duration + ') ms sin retrasar la consulta', async () => {
      const loading = new MinimumLoading();
      const finish = loading.begin(true);
      const request = vi.fn(() => new Promise<void>((r) => setTimeout(r, duration)));
      const response = request().finally(finish);
      expect(request).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(Math.max(750, duration) - 1);
      expect(loading.visible()).toBe(true);
      await vi.advanceTimersByTimeAsync(1);
      await response;
      expect(loading.visible()).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    });
  }
  it('finaliza ante errores y resultados vacíos', async () => {
    for (const fail of [true, false]) {
      const loading = new MinimumLoading();
      const finish = loading.begin(true);
      const result = (fail ? Promise.reject(Error('offline')) : Promise.resolve([])).finally(
        finish,
      );
      const assertion = fail
        ? expect(result).rejects.toThrow('offline')
        : expect(result).resolves.toEqual([]);
      await assertion;
      expect(loading.visible()).toBe(true);
      await vi.advanceTimersByTimeAsync(750);
      expect(loading.visible()).toBe(false);
    }
  });
  it('una recarga no acorta el minimo inicial', async () => {
    const loading = new MinimumLoading();
    const finish = loading.begin(true);
    await vi.advanceTimersByTimeAsync(100);
    finish();
    loading.begin(false)();
    await vi.advanceTimersByTimeAsync(649);
    expect(loading.visible()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(loading.visible()).toBe(false);
  });
  it('no demora recargas secundarias y cancela cargas anteriores', async () => {
    const loading = new MinimumLoading();
    const old = loading.begin(true);
    old();
    const current = loading.begin(true);
    expect(vi.getTimerCount()).toBe(0);
    old();
    expect(loading.visible()).toBe(true);
    loading.cancel();
    current();
    expect(loading.visible()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    loading.begin(false)();
    expect(loading.visible()).toBe(false);
  });
});
