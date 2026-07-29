import { isAuthError } from "./notebooklm.js";

export function toNotebookLMError(error: unknown) {
  if (isAuthError(error)) {
    return {
      statusCode: 503,
      body: {
        code: "NOTEBOOKLM_AUTH_REQUIRED",
        error: "NotebookLM 连接已失效，请在服务器上重新连接后重试。",
      },
    } as const;
  }

  return {
    statusCode: 502,
    body: {
      code: "NOTEBOOKLM_UPSTREAM_ERROR",
      error: "NotebookLM 服务暂时不可用，请稍后重试。",
    },
  } as const;
}

export function toRemoteDeleteError(error?: unknown) {
  if (error && isAuthError(error)) {
    return toNotebookLMError(error);
  }

  return {
    statusCode: 502,
    body: {
      code: "REMOTE_DELETE_FAILED",
      error: "NotebookLM 远端删除失败，本地记录已保留，请重试。",
    },
  } as const;
}
