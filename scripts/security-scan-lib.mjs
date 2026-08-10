const SECRET_RULES = [
  {
    id: 'private-key',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    id: 'supabase-secret-key',
    pattern: /sb_secret_[A-Za-z0-9_-]{16,}/g,
  },
  {
    id: 'brevo-api-key',
    pattern: /xkeysib-[A-Za-z0-9_-]{20,}/g,
  },
  {
    id: 'github-token',
    pattern: /gh[pousr]_[A-Za-z0-9]{30,}/g,
  },
  {
    id: 'aws-access-key',
    pattern: /AKIA[0-9A-Z]{16}/g,
  },
  {
    id: 'privileged-vite-variable',
    pattern:
      /VITE_[A-Z0-9_]*(?:SECRET|SERVICE_ROLE|SMTP_PASS|DATABASE_PASSWORD)[A-Z0-9_]*\s*=/g,
  },
]

export function scanTextForSecrets(text) {
  const findings = []

  for (const rule of SECRET_RULES) {
    rule.pattern.lastIndex = 0
    let match = rule.pattern.exec(text)

    while (match) {
      const line = text.slice(0, match.index).split('\n').length
      findings.push({ rule: rule.id, line })
      match = rule.pattern.exec(text)
    }
  }

  return findings
}
