import { checkDevice, desktopOs } from '../../src/survey/respondent-checks';
import { deviceLimitsOn, effectiveSecurity } from '../../src/survey/vendor-security';

const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15';
const LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';
const CROS = 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';
const IPAD_OLD = 'Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const ANDROID_TAB = 'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';
const KINDLE = 'Mozilla/5.0 (Kindle; Silk/3.0)';
const PHONE_OTHER = 'Mozilla/5.0 (BlackBerry; Mobile)';

describe('Desktop and tablet systems (feedback 2026-11-16)', () => {
  it('reads the desktop system', () => {
    expect(desktopOs(WIN)).toBe('windows');
    expect(desktopOs(MAC)).toBe('mac');
    expect(desktopOs(LINUX)).toBe('linux');
    expect(desktopOs(CROS)).toBe('other');
  });

  it('blocks only the unticked desktop system', () => {
    const d = { desktop: true, windows: true, mac: false, linux: true };
    expect(checkDevice(d, WIN).ok).toBe(true);
    expect(checkDevice(d, MAC)).toMatchObject({ ok: false, reason: 'OS_NOT_ALLOWED', note: 'desktop' });
    expect(checkDevice({ desktop: true, linux: false }, LINUX).ok).toBe(false);
    expect(checkDevice({ desktop: true, desktopOther: false }, CROS).ok).toBe(false);
  });

  it('blocks only the unticked tablet system', () => {
    expect(checkDevice({ tablet: true, tabletIos: false }, IPAD_OLD)).toMatchObject({ ok: false, reason: 'OS_NOT_ALLOWED', note: 'tablet' });
    expect(checkDevice({ tablet: true, tabletIos: false }, ANDROID_TAB).ok).toBe(true);
    expect(checkDevice({ tablet: true, tabletAndroid: false }, ANDROID_TAB).ok).toBe(false);
    expect(checkDevice({ tablet: true, tabletOther: false }, KINDLE).ok).toBe(false);
  });

  it('keeps old projects working: other phones only with both Android and iOS, unless mobileOther is set', () => {
    expect(checkDevice({ mobile: true, android: true, ios: true }, PHONE_OTHER).ok).toBe(true);
    expect(checkDevice({ mobile: true, android: true, ios: false }, PHONE_OTHER).ok).toBe(false);
    expect(checkDevice({ mobile: true, android: true, ios: false, mobileOther: true }, PHONE_OTHER).ok).toBe(true);
    expect(checkDevice({ mobile: true, android: true, ios: true, mobileOther: false }, PHONE_OTHER)).toMatchObject({ ok: false, reason: 'MOBILE_OS_NOT_ALLOWED' });
    expect(checkDevice(null, WIN).ok).toBe(true);
  });
});

describe('Security per vendor', () => {
  it('applies the project, then the vendor, then the project setting for the vendor', () => {
    const project = { duplicateDetection: true, captcha: true, gateSurvey: false };
    expect(effectiveSecurity(project, null, null)).toEqual(project);
    expect(effectiveSecurity(project, { duplicateDetection: false }, null)).toMatchObject({ duplicateDetection: false, captcha: true });
    expect(effectiveSecurity(project, { duplicateDetection: false }, { duplicateDetection: true, gateSurvey: true })).toMatchObject({ duplicateDetection: true, gateSurvey: true });
    expect(effectiveSecurity(project, { junk: false, captcha: 'no' }, null)).toEqual(project);
  });

  it('switches device limits off per vendor', () => {
    expect(deviceLimitsOn(null, null)).toBe(true);
    expect(deviceLimitsOn({ deviceLimits: false }, null)).toBe(false);
    expect(deviceLimitsOn({ deviceLimits: false }, { deviceLimits: true })).toBe(true);
  });
});
