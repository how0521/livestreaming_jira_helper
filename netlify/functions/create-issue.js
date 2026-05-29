const JIRA_URL = 'https://cmoney.atlassian.net';
const PROJECT_KEY = 'AUTHOR';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_TOKEN;
  if (!email || !token) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: '伺服器未設定 JIRA_EMAIL / JIRA_TOKEN 環境變數' }),
    };
  }

  let appid, memberIds;
  try {
    ({ appid, memberIds } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: '請求格式錯誤' }) };
  }

  const auth = 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
  const headers = {
    Authorization: auth,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  try {
    // Get project components
    const projectRes = await fetch(`${JIRA_URL}/rest/api/3/project/${PROJECT_KEY}`, { headers });
    const project = await projectRes.json();
    const components = project.components || [];
    const compIds = [];
    const backComp = components.find(c => c.name.toLowerCase() === 'back-end');
    const overseasComp = components.find(c => c.name.toLowerCase() === 'overseas');
    if (backComp) compIds.push({ id: backComp.id });
    if (overseasComp) compIds.push({ id: overseasComp.id });

    // Search assignee — try multiple queries to cover different name formats
    let assignee = null;
    for (const query of ['Maxence', '楊竣安', 'Maxence_Yang']) {
      const userRes = await fetch(`${JIRA_URL}/rest/api/3/user/search?query=${encodeURIComponent(query)}&maxResults=10`, { headers });
      const users = await userRes.json();
      assignee = Array.isArray(users) && users.find(u =>
        (u.displayName && (u.displayName.includes('楊竣安') || u.displayName.toLowerCase().includes('maxence')))
      );
      if (assignee) break;
    }

    if (!assignee) {
      return { statusCode: 400, body: JSON.stringify({ error: '找不到受託人，請確認 Jira 上 Maxence Yang 的帳號存在' }) };
    }

    // Create issue
    const issueRes = await fetch(`${JIRA_URL}/rest/api/3/issue`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fields: {
          project: { key: PROJECT_KEY },
          summary: `【${appid}】影音直播admin全線開通`,
          issuetype: { name: 'Task' },
          assignee: { accountId: assignee.accountId },
          components: compIds,
          description: {
            type: 'doc',
            version: 1,
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: `AppID：${appid}` }] },
              { type: 'paragraph', content: [{ type: 'text', text: `Member ID：${memberIds.join('、')}` }] },
            ],
          },
        },
      }),
    });

    if (!issueRes.ok) {
      const err = await issueRes.json().catch(() => ({}));
      const msg = (err.errorMessages && err.errorMessages[0])
        || Object.values(err.errors || {}).join('; ')
        || `HTTP ${issueRes.status}`;
      return { statusCode: issueRes.status, body: JSON.stringify({ error: msg }) };
    }

    const issue = await issueRes.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: issue.key, url: `${JIRA_URL}/browse/${issue.key}` }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
