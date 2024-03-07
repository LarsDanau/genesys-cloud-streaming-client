import * as utils from '../../src/utils';
import { retryPromise } from '../../src/utils';
import { flushPromises } from '../helpers/testing-utils';

describe('Utils', () => {
  describe('jid utils', () => {
    it('isAcdJid', () => {
      expect(utils.isAcdJid('acd-sdkfjk@test.com')).toBeTruthy();
      expect(utils.isAcdJid('acd-sdkfjk@gjoll.com')).toBeFalsy();
      expect(utils.isAcdJid('sdkfjk@test.com')).toBeFalsy();
    });

    it('isScreenRecordingJid', () => {
      expect(utils.isScreenRecordingJid('screenrecording-sdkfjk@test.com')).toBeTruthy();
      expect(utils.isScreenRecordingJid('screenrecording-sdkfjk@gjoll.test.com')).toBeFalsy();
      expect(utils.isScreenRecordingJid('sdkfjk@test.com')).toBeFalsy();
    });

    it('isSoftphoneJid', () => {
      expect(utils.isSoftphoneJid('sdkfjk@gjoll.test.com')).toBeTruthy();
      expect(utils.isSoftphoneJid('sdkfjk@test.com')).toBeFalsy();
      expect(utils.isSoftphoneJid('')).toBeFalsy();
    });

    it('isVideoJid', () => {
      expect(utils.isVideoJid('sdkfjk@conference.test.com')).toBeTruthy();
      expect(utils.isVideoJid('acd-sdkfjk@conference.test.com')).toBeFalsy();
      expect(utils.isVideoJid('sdkfjk@test.com')).toBeFalsy();
    });
  });

  describe('retryPromise()', () => {
    const flush = async (ms?: number) => {
      await new Promise(res => setImmediate(res));
      if (ms) {
        jest.advanceTimersByTime(ms);
      }
    };

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.clearAllTimers();
    });

    it('should keep retrying function until it passes', async (done) => {
      const DELAY = 1000;
      let retryCount = 0;
      let retryFn = jest.fn().mockImplementation(() => {
        return retryCount++ > 2 ? Promise.resolve('Yeet') : Promise.reject('No')
      });

      const retry = retryPromise(retryFn, () => true, DELAY, { debug: jest.fn() });

      /* do not finish the test until this completes */
      retry.promise.then(value => {
        expect(value).toBe('Yeet');
        done();
      });

      /* expected to be called right away */
      expect(retryFn).toHaveBeenCalledTimes(1);

      /* called a 2nd time after waiting */
      await flush(DELAY);
      expect(retryFn).toHaveBeenCalledTimes(2);
      expect(retry.hasCompleted()).toBe(false);

      /* called a 3rd time after waiting */
      await flush(DELAY);
      expect(retryFn).toHaveBeenCalledTimes(3);
      expect(retry.hasCompleted()).toBe(false);

      /* after waiting the 4th time, it should complete */
      await flush(DELAY);
      expect(retryFn).toHaveBeenCalledTimes(4);
      expect(retry.hasCompleted()).toBe(true);
    });

    it('should wait the amount of time returned from the retry handler', async () => {
      jest.useFakeTimers();

      const fn = jest.fn().mockRejectedValueOnce({}).mockResolvedValue(null);
      const retry = retryPromise(
        fn,
        () => 2000
      );

      await flushPromises();
      expect(fn).toHaveBeenCalledTimes(1);
      fn.mockReset();

      jest.advanceTimersByTime(1000);
      await flushPromises();

      expect(fn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1100);
      await flushPromises();

      expect(fn).toHaveBeenCalled();
    });
  });
});
