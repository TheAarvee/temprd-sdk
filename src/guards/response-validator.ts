export class ResponseValidator {
  validate(response: unknown): { valid: boolean; reason?: string } {
    if (response === null || response === undefined) {
      return { valid: false, reason: "null_response" };
    }

    if (typeof response === "string") {
      return response.trim() === ""
        ? { valid: false, reason: "empty_string_response" }
        : { valid: true };
    }

    if (Array.isArray(response)) {
      return { valid: true };
    }

    if (typeof response === "object") {
      const record = response as Record<string, unknown>;
      if (Object.keys(record).length === 0) {
        return { valid: false, reason: "empty_object_response" };
      }

      if ("error" in record || "errors" in record || "errorMessage" in record) {
        return { valid: false, reason: "error_in_200_response" };
      }

      if ("data" in record && record.data === null) {
        return { valid: false, reason: "null_data_field" };
      }
    }

    return { valid: true };
  }
}
