/**
 * Secret & Sensitive Data Sanitizer
 * Redacts tokens, passwords, private keys, and cloud credentials before
 * they are transmitted to LLM providers or persisted in audit logs.
 */

export class SecretSanitizer {
  private static readonly PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
    // 1. Private Keys (RSA, OPENSSH, EC, PGP, DSA)
    {
      regex: /-----BEGIN (?:[A-Z ]*?)PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]*?)PRIVATE KEY-----/g,
      replacement: '[REDACTED_PRIVATE_KEY]',
    },
    // 2. AWS Access Key IDs (AKIA...)
    {
      regex: /\b(AKIA[0-9A-Z]{16})\b/g,
      replacement: '[REDACTED_AWS_ACCESS_KEY]',
    },
    // 3. AWS Secret Access Keys in key=value or JSON
    {
      regex: /(aws_secret_access_key\s*[:=]\s*["']?)([A-Za-z0-9\/+=]{40})(["']?)/gi,
      replacement: '$1[REDACTED_AWS_SECRET_KEY]$3',
    },
    // 4. JSON Web Tokens (JWT) / Bearer Tokens
    {
      regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      replacement: '[REDACTED_JWT_TOKEN]',
    },
    // 5. GitHub Personal Access Tokens (classic and fine-grained)
    {
      regex: /\b(gh[pousr]_[A-Za-z0-9_]{36,255})\b/g,
      replacement: '[REDACTED_GITHUB_TOKEN]',
    },
    // 6. GitLab Personal Access Tokens
    {
      regex: /\b(glpat-[A-Za-z0-9\-]{20,})\b/g,
      replacement: '[REDACTED_GITLAB_TOKEN]',
    },
    // 7. Slack API Tokens (Bot / User / App)
    {
      regex: /\b(xox[baprs]-[A-Za-z0-9\-]{10,})\b/g,
      replacement: '[REDACTED_SLACK_TOKEN]',
    },
    // 8. Database Connection Strings with Passwords (postgres, mysql, mongodb, redis, etc.)
    {
      regex: /((?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp|mssql):\/\/[^:\s\/]+:)([^@\s\/]+)(@)/gi,
      replacement: '$1[REDACTED_DB_PASSWORD]$3',
    },
    // 9. Generic key-value passwords & tokens in configs/env (e.g., password: "...", api_key="...")
    {
      regex: /((?:password|passwd|client_secret|api_key|apikey|auth_token|access_token|secret_key)\s*[:=]\s*["']?)([^"'\s\n\r]{4,})(["']?)/gi,
      replacement: '$1[REDACTED_SECRET]$3',
    },
    // 10. Authorization: Bearer <token> headers
    {
      regex: /(Authorization:\s*Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi,
      replacement: '$1[REDACTED_BEARER_TOKEN]',
    },
  ];

  /**
   * Redacts sensitive secrets from a string
   */
  static sanitize(text: string): string {
    if (!text || typeof text !== 'string') {
      return text;
    }

    let result = text;
    for (const { regex, replacement } of this.PATTERNS) {
      result = result.replace(regex, replacement);
    }
    return result;
  }

  /**
   * Recursively sanitizes strings inside an object or array
   */
  static sanitizeObject<T>(obj: T): T {
    if (!obj) return obj;

    if (typeof obj === 'string') {
      return this.sanitize(obj) as unknown as T;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item)) as unknown as T;
    }

    if (typeof obj === 'object') {
      const sanitized: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        // Redact values of sensitive keys completely if string
        if (
          typeof value === 'string' &&
          /(password|passwd|secret|token|api_key|apiKey|private_key|privateKey)/i.test(key)
        ) {
          sanitized[key] = '[REDACTED_SECRET]';
        } else {
          sanitized[key] = this.sanitizeObject(value);
        }
      }
      return sanitized as T;
    }

    return obj;
  }
}
