// netlify/functions/analyze.js
// Node 18+。請在 Netlify 上設定環境變數 OPENROUTER_API_KEY

export default async (req, context) => {
  try {
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const { imageDataURL } = await req.json();
    if (!imageDataURL || typeof imageDataURL !== 'string') {
      return new Response(JSON.stringify({ error: 'imageDataURL 缺失' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 安全：從環境讀取金鑰
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key missing' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 建立提示（系統 + 使用者）
    const systemPrompt = `
你是一位資深中醫與健康管理顧問，擅長以「手掌外觀」作生活型態觀察。
嚴格遵守：本結果僅供日常健康管理參考，非診斷；遇到紅腫、劇痛、麻木、傷口感染等情況要建議盡快求醫。
請以「重點觀察」「可能含意（非診斷）」「建議與待辦」三段輸出，語氣中立、具體可行。
避免敏感斷言（如確診某疾病、開藥），必要時提供可檢查的客觀指標（例如：肝功能、膽紅素、空腹血糖、鐵蛋白等）。
`.trim();

    const userPrompt = `
請由上載的「手掌相片」出發，結合皮膚水份、掌色（紅、白、黃、紫暗）、肌丘（大魚際、中魚際等）、勞損跡象（繭、裂）、末梢循環等角度，給我一份條理清晰的中文報告。
若影像不清晰，請先給出「需要更清晰的拍攝要點」。
`.trim();

    // 發送到 OpenRouter API（多模態：文字 + 圖像）
    const payload = {
      model: "openai/gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            // 直接傳 dataURL（base64）
            { type: "image_url", image_url: { url: imageDataURL } }
          ]
        }
      ]
    };

    const openaiResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://hand-ai-analysis.netlify.app/",
        "X-Title": "Hand AI Analysis"
      },
      body: JSON.stringify(payload)
    });

    if (!openaiResp.ok) {
      const errText = await openaiResp.text();
      return new Response(JSON.stringify({ error: "OpenRouter API 錯誤", detail: errText }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await openaiResp.json();

    // 從 OpenRouter 回應中提取文字
    const extractText = (data) => {
      if (!data) return "";
      
      // OpenRouter API 回傳格式
      if (data.choices && Array.isArray(data.choices) && data.choices.length > 0) {
        const message = data.choices[0].message;
        if (message && message.content) {
          return typeof message.content === 'string' 
            ? message.content 
            : Array.isArray(message.content)
              ? message.content.map(c => c.text || "").join("\n")
              : JSON.stringify(message.content);
        }
      }
      
      return JSON.stringify(data);
    };

    const text = extractText(data).trim();

    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

