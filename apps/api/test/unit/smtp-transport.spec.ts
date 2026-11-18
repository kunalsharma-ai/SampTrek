import { smtpFrom } from '../../src/common/config';
import { KIND } from '../../src/integrations/catalog';

describe('Zoho SMTP settings', () => {
  it('defaults to smtppro.zoho.in on port 465 with SSL, signing in as the sending mailbox', () => {
    expect(smtpFrom({ SMTP_USER: 'reports@company.test', SMTP_PASS: 'stored-app-password' })).toMatchObject({
      host: 'smtppro.zoho.in',
      port: 465,
      secure: true,
      user: 'reports@company.test',
      pass: 'stored-app-password',
      from: 'reports@company.test',
    });
  });

  it('keeps the server, port and encryption editable', () => {
    expect(smtpFrom({ SMTP_HOST: 'smtppro.zoho.com', SMTP_PORT: '587', SMTP_SECURE: 'false', SMTP_USER: 'a@b.test', SMTP_PASS: 'p' })).toMatchObject({ host: 'smtppro.zoho.com', port: 587, secure: false });
    // Older saved settings without the encryption choice follow the port.
    expect(smtpFrom({ SMTP_PORT: '587', SMTP_USER: 'a@b.test', SMTP_PASS: 'p' })!.secure).toBe(false);
  });

  it('is not set up without a stored mailbox and password', () => {
    expect(smtpFrom({})).toBeNull();
    expect(smtpFrom({ SMTP_USER: 'a@b.test' })).toBeNull();
  });

  it('shows the Zoho defaults in Settings → Integrations', () => {
    const f = Object.fromEntries(KIND.smtp.fields.map((x) => [x.key, x.default]));
    expect(f).toMatchObject({ SMTP_HOST: 'smtppro.zoho.in', SMTP_PORT: '465', SMTP_SECURE: 'true' });
  });
});
