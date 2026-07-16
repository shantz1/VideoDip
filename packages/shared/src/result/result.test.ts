import { describe, expect, it } from 'vitest';
import {
  appError,
  err,
  flatMap,
  isErr,
  isOk,
  map,
  ok,
  tryCatch,
  tryCatchAsync,
  unwrapOr,
} from './result.js';

const boom = () => appError('UNKNOWN', 'boom', 'Try again.');

describe('Result construction and guards', () => {
  it('narrows an ok result to its value', () => {
    const result = ok(42);
    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);
    if (isOk(result)) expect(result.value).toBe(42);
  });

  it('narrows an err result to its error', () => {
    const result = err(boom());
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('UNKNOWN');
  });
});

describe('map', () => {
  it('transforms the value of an ok result', () => {
    expect(map(ok(2), (n) => n * 3)).toEqual(ok(6));
  });

  it('passes an err result through without invoking the function', () => {
    let called = false;
    const result = map(err<string>('nope'), () => {
      called = true;
      return 1;
    });
    expect(result).toEqual(err('nope'));
    expect(called).toBe(false);
  });
});

describe('flatMap', () => {
  it('chains a fallible operation onto an ok result', () => {
    expect(flatMap(ok(2), (n) => ok(n + 1))).toEqual(ok(3));
  });

  it('propagates a failure produced by the chained operation', () => {
    expect(flatMap(ok(2), () => err('inner'))).toEqual(err('inner'));
  });

  it('short-circuits when the input is already an err', () => {
    let called = false;
    flatMap(err<string>('outer'), () => {
      called = true;
      return ok(1);
    });
    expect(called).toBe(false);
  });
});

describe('unwrapOr', () => {
  it('returns the value when ok', () => {
    expect(unwrapOr(ok(1), 99)).toBe(1);
  });

  it('returns the fallback when err', () => {
    expect(unwrapOr(err<string>('x'), 99)).toBe(99);
  });
});

describe('tryCatch', () => {
  it('captures a thrown exception as an err carrying the cause', () => {
    const thrown = new Error('kaboom');
    const result = tryCatch(
      () => {
        throw thrown;
      },
      (cause) => appError('IO', 'read failed', 'Check the file exists.', { cause }),
    );

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('IO');
      expect(result.error.cause).toBe(thrown);
    }
  });

  it('returns ok when nothing throws', () => {
    expect(tryCatch(() => 5, boom)).toEqual(ok(5));
  });
});

describe('tryCatchAsync', () => {
  it('captures a rejected promise as an err', async () => {
    const result = await tryCatchAsync(() => Promise.reject(new Error('nope')), boom);
    expect(isErr(result)).toBe(true);
  });

  it('returns ok when the promise resolves', async () => {
    expect(await tryCatchAsync(() => Promise.resolve('done'), boom)).toEqual(ok('done'));
  });
});

describe('appError', () => {
  it('defaults to non-retryable', () => {
    expect(appError('IO', 'm', 'r').retryable).toBe(false);
  });

  it('omits optional fields rather than setting them undefined', () => {
    // exactOptionalPropertyTypes is on; an explicit `cause: undefined` would be
    // a type error for consumers reading the key.
    expect('cause' in appError('IO', 'm', 'r')).toBe(false);
    expect('context' in appError('IO', 'm', 'r')).toBe(false);
  });

  it('carries context and cause when supplied', () => {
    const error = appError('PROCESS_FAILED', 'ffmpeg died', 'Re-import the clip.', {
      retryable: true,
      cause: 'exit 1',
      context: { exitCode: 1 },
    });
    expect(error.retryable).toBe(true);
    expect(error.context).toEqual({ exitCode: 1 });
  });
});
