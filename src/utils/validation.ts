/**
 * 输入验证工具函数
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 验证非空字符串
 */
export function isNonEmptyString(value: unknown, fieldName: string): ValidationResult {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return {
      valid: false,
      errors: [`${fieldName} must be a non-empty string`]
    };
  }
  return { valid: true, errors: [] };
}

/**
 * 验证字符串长度
 */
export function isValidLength(
  value: string,
  min: number,
  max: number,
  fieldName: string
): ValidationResult {
  if (value.length < min || value.length > max) {
    return {
      valid: false,
      errors: [`${fieldName} must be between ${min} and ${max} characters`]
    };
  }
  return { valid: true, errors: [] };
}

/**
 * 验证 UUID 格式
 */
export function isValidUuid(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * 验证会话 ID
 */
export function validateSessionId(value: unknown): ValidationResult {
  if (typeof value !== 'string') {
    return {
      valid: false,
      errors: ['sessionId must be a string']
    };
  }

  if (!isValidUuid(value)) {
    return {
      valid: false,
      errors: ['sessionId must be a valid UUID']
    };
  }

  return { valid: true, errors: [] };
}

/**
 * 验证消息内容
 */
export function validateContent(value: unknown): ValidationResult {
  if (typeof value !== 'string') {
    return {
      valid: false,
      errors: ['content must be a string']
    };
  }

  if (value.length === 0) {
    return {
      valid: false,
      errors: ['content cannot be empty']
    };
  }

  if (value.length > 100000) {
    return {
      valid: false,
      errors: ['content exceeds maximum length (100000 characters)']
    };
  }

  return { valid: true, errors: [] };
}

/**
 * 验证会话名称
 */
export function validateSessionName(value: unknown): ValidationResult {
  const result = isNonEmptyString(value, 'name');
  if (!result.valid) return result;

  return isValidLength(value as string, 1, 100, 'name');
}

/**
 * 验证提供者名称
 */
export function validateProviderName(value: unknown): ValidationResult {
  const validProviders = ['openai', 'anthropic', 'ollama'];

  if (typeof value !== 'string') {
    return {
      valid: false,
      errors: ['provider must be a string']
    };
  }

  if (!validProviders.includes(value)) {
    return {
      valid: false,
      errors: [`provider must be one of: ${validProviders.join(', ')}`]
    };
  }

  return { valid: true, errors: [] };
}

/**
 * 验证模型名称
 */
export function validateModelName(value: unknown): ValidationResult {
  const result = isNonEmptyString(value, 'model');
  if (!result.valid) return result;

  return isValidLength(value as string, 1, 100, 'model');
}

/**
 * 验证系统提示词
 */
export function validateSystemPrompt(value: unknown): ValidationResult {
  if (value === undefined || value === null) {
    return { valid: true, errors: [] }; // 可选字段
  }

  if (typeof value !== 'string') {
    return {
      valid: false,
      errors: ['systemPrompt must be a string']
    };
  }

  if (value.length > 10000) {
    return {
      valid: false,
      errors: ['systemPrompt exceeds maximum length (10000 characters)']
    };
  }

  return { valid: true, errors: [] };
}

/**
 * 合并多个验证结果
 */
export function mergeResults(...results: ValidationResult[]): ValidationResult {
  const allErrors = results.flatMap(r => r.errors);
  return {
    valid: allErrors.length === 0,
    errors: allErrors
  };
}

/**
 * 验证 payload 中的必需字段
 */
export function validateRequiredFields(
  payload: Record<string, unknown>,
  fields: string[]
): ValidationResult {
  const errors: string[] = [];

  for (const field of fields) {
    if (payload[field] === undefined || payload[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
