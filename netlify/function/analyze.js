// netlify/functions/analyze.js
// Node 18+。請在 Netlify 上設定環境變數 OPENAI_API_KEY

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
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: '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' }), {
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

    // 發送到 OpenAI Responses API（多模態：文字 + 圖像）
    const payload = {
      model: "gpt-4o-mini",
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }]
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: userPrompt },
            // 直接傳 dataURL（base64）
            { type: "input_image", image_url: { url: imageDataURL } }
          ]
        }
      ]
    };

    const openaiResp = await fetch("openai/gpt-oss-20b:free", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!openaiResp.ok) {
      const errText = await openaiResp.text();
      return new Response(JSON.stringify({ error: "OpenAI API 錯誤", detail: errText }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await openaiResp.json();

    // 嘗試通用方式抽取文字（Responses API 的回傳可能更新，做降級容錯）
    const fallbackToText = (obj) => {
      if (!obj) return "";
      if (typeof obj === "string") return obj;
      if (Array.isArray(obj)) return obj.map(fallbackToText).join("\n");
      if (obj.output_text) return obj.output_text;

      // 尋找 output[].content[].text
      if (obj.output && Array.isArray(obj.output)) {
        for (const item of obj.output) {
          if (item?.content && Array.isArray(item.content)) {
            const t = item.content.map(c => c?.text || "").join("\n").trim();
            if (t) return t;
          }
        }
      }
      // 一些情況在 top-level 的 content
      if (obj.content && Array.isArray(obj.content)) {
        const t = obj.content.map(c => c?.text || "").join("\n").trim();
        if (t) return t;
      }
      return JSON.stringify(obj);
    };

    const text = fallbackToText(data).trim();

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

