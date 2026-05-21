import axios from "axios";

const BASE_URL = "https://www.waboxapp.com/api";

export interface WaboxStatusResponse {
  success: boolean;
  uid?: string;
  hook_url?: string;
  alias?: string;
  platform?: string;
  battery?: string;
  plugged?: string;
  locale?: string;
  error?: string;
}

export interface WaboxSendResponse {
  success: boolean;
  custom_uid?: string;
  error?: string;
}

/**
 * Verifica o status de uma instância WhatsApp via WaboxApp API.
 * Retorna os dados da instância se estiver online, ou success=false se offline/erro.
 */
export async function checkInstanceStatus(
  token: string,
  uid: string
): Promise<WaboxStatusResponse> {
  try {
    const response = await axios.get(`${BASE_URL}/status/${uid}`, {
      params: { token },
      timeout: 10000,
    });
    return response.data as WaboxStatusResponse;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      return { success: false, error: error.response.data?.error ?? "API error" };
    }
    return { success: false, error: "Network error" };
  }
}

/**
 * Envia uma mensagem de texto via WaboxApp API.
 */
export async function sendTextMessage(
  token: string,
  uid: string,
  to: string,
  text: string,
  customUid: string
): Promise<WaboxSendResponse> {
  try {
    // WaboxApp API requires POST with application/x-www-form-urlencoded body
    const params = new URLSearchParams();
    params.append("token", token);
    params.append("uid", uid);
    params.append("to", to);
    params.append("text", text);
    params.append("custom_uid", customUid);

    const response = await axios.post(`${BASE_URL}/send/chat`, params.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 15000,
    });
    return response.data as WaboxSendResponse;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      return { success: false, error: error.response.data?.error ?? "Send error" };
    }
    return { success: false, error: "Network error" };
  }
}
