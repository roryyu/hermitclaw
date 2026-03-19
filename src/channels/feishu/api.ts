const FEISHU_BASE_URL = 'https://open.feishu.cn/open-apis';

export interface FeishuConfig {
  appId: string;
  appSecret: string;
}

export interface FeishuToken {
  tenantAccessToken: string;
  expire: number;
}

let cachedToken: FeishuToken | null = null;

async function getTenantAccessToken(config: FeishuConfig): Promise<string> {
  if (cachedToken && cachedToken.expire > Date.now()) {
    return cachedToken.tenantAccessToken;
  }

  const response = await fetch(`${FEISHU_BASE_URL}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: config.appId,
      app_secret: config.appSecret
    })
  });

  const data = await response.json() as {
    code: number;
    msg: string;
    tenant_access_token: string;
    expire: number;
  };

  if (data.code !== 0) {
    throw new Error(`Feishu auth error: ${data.msg}`);
  }

  cachedToken = {
    tenantAccessToken: data.tenant_access_token,
    expire: Date.now() + (data.expire - 60) * 1000
  };

  return cachedToken.tenantAccessToken;
}

export async function sendMessage(
  config: FeishuConfig,
  receiveId: string,
  content: string,
  receiveIdType: 'open_id' | 'chat_id' | 'user_id' = 'chat_id'
): Promise<void> {
  const token = await getTenantAccessToken(config);

  const body = {
    receive_id: receiveId,
    msg_type: 'text',
    content: JSON.stringify({ text: content })
  };

  const response = await fetch(
    `${FEISHU_BASE_URL}/im/v1/messages?receive_id_type=${receiveIdType}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(body)
    }
  );

  const data = await response.json() as { code: number; msg: string };

  if (data.code !== 0) {
    throw new Error(`Feishu send error: ${data.msg}`);
  }
}

export async function sendRichText(
  config: FeishuConfig,
  receiveId: string,
  title: string,
  content: Array<Array<{ tag: string; text?: string; href?: string }>>,
  receiveIdType: 'open_id' | 'chat_id' | 'user_id' = 'chat_id'
): Promise<void> {
  const token = await getTenantAccessToken(config);

  const body = {
    receive_id: receiveId,
    msg_type: 'post',
    content: JSON.stringify({
      post: {
        zh_cn: { title, content }
      }
    })
  };

  const response = await fetch(
    `${FEISHU_BASE_URL}/im/v1/messages?receive_id_type=${receiveIdType}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(body)
    }
  );

  const data = await response.json() as { code: number; msg: string };

  if (data.code !== 0) {
    throw new Error(`Feishu send error: ${data.msg}`);
  }
}

export async function listChats(config: FeishuConfig): Promise<Array<{ chatId: string; name: string }>> {
  const token = await getTenantAccessToken(config);

  const response = await fetch(
    `${FEISHU_BASE_URL}/im/v1/chats?page_size=50`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );

  const data = await response.json() as {
    code: number;
    msg: string;
    data?: { items: Array<{ chat_id: string; name: string }> };
  };

  if (data.code !== 0) {
    throw new Error(`Feishu list chats error: ${data.msg}`);
  }

  return (data.data?.items || []).map(item => ({
    chatId: item.chat_id,
    name: item.name
  }));
}

export async function listMessages(
  config: FeishuConfig,
  chatId: string,
  limit: number = 10
): Promise<Array<{ messageId: string; sender: string; content: string; createTime: string }>> {
  const token = await getTenantAccessToken(config);

  const response = await fetch(
    `${FEISHU_BASE_URL}/im/v1/messages?container_id_type=chat&container_id=${chatId}&page_size=${limit}`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );

  const data = await response.json() as {
    code: number;
    msg: string;
    data?: {
      items: Array<{
        message_id: string;
        sender: { id: string };
        body: { content: string };
        create_time: string;
      }>;
    };
  };

  if (data.code !== 0) {
    throw new Error(`Feishu list messages error: ${data.msg}`);
  }

  return (data.data?.items || []).map(item => ({
    messageId: item.message_id,
    sender: item.sender.id,
    content: item.body?.content || '',
    createTime: item.create_time
  }));
}
