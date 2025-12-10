const axios = require('axios');

module.exports = async (req, res) => {
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
    
    // 处理预检请求
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // 只允许POST请求
    if (req.method !== 'POST') {
        return res.status(405).json({ error: '只支持POST请求' });
    }
    
    try {
        console.log('收到请求，body类型:', typeof req.body);
        
        // 直接使用req.body，Vercel会自动解析JSON
        const { text, lang = 'zh' } = req.body || {};
        
        if (!text || text.length < 5) {
            return res.status(400).json({ 
                error: 'Invalid input',
                message: '合同文本不能为空'
            });
        }
        
        // API密钥 - 使用环境变量或硬编码
        const API_KEY = process.env.TONGYI_API_KEY || "sk-81dd44c8f7104ba6aa1146a5104d3139";
        
        if (!API_KEY || API_KEY === 'your-api-key-here') {
            throw new Error('API密钥未配置');
        }
        
        console.log(`开始AI分析，语言: ${lang}, 文本长度: ${text.length}`);
        
        // 构建提示词
        let prompt;
        if (lang === 'zh') {
            prompt = `作为专业外贸律师，请分析以下合同的风险点和改进建议：\n\n${text}`;
        } else if (lang === 'en') {
            prompt = `As a professional trade lawyer, please analyze risks and suggestions for this contract:\n\n${text}`;
        } else {
            prompt = `Como abogado profesional de comercio exterior, analice los riesgos y sugerencias de este contrato:\n\n${text}`;
        }
        
        // 限制文本长度
        const limitedPrompt = prompt.length > 3000 ? prompt.substring(0, 3000) + '...' : prompt;
        
        const response = await axios.post(
            'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
            {
                model: "qwen-turbo",
                input: {
                    messages: [{
                        role: "user",
                        content: limitedPrompt
                    }]
                },
                parameters: {
                    result_format: "message",
                    max_tokens: 1500,
                    temperature: 0.1
                }
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${API_KEY}`
                },
                timeout: 30000 // 30秒超时
            }
        );
        
        console.log('API调用成功，状态码:', response.status);
        
        const result = response.data;
        
        // 提取内容
        let aiContent = '';
        if (result.output) {
            if (result.output.choices && result.output.choices[0]) {
                aiContent = result.output.choices[0].message?.content || '';
            } else if (result.output.text) {
                aiContent = result.output.text;
            }
        }
        
        if (!aiContent) {
            aiContent = "AI分析完成，但返回内容为空。";
        }
        
        res.status(200).json({
            success: true,
            result: aiContent,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('错误详情:', error.message);
        console.error('错误堆栈:', error.stack);
        
        let errorMessage = '分析失败';
        let statusCode = 500;
        
        if (error.response) {
            statusCode = error.response.status;
            errorMessage = `API错误 (${statusCode})`;
            if (error.response.data) {
                console.error('API错误响应:', JSON.stringify(error.response.data));
            }
        } else if (error.request) {
            errorMessage = '网络错误，无法连接到AI服务';
        } else if (error.code === 'ECONNABORTED') {
            errorMessage = '请求超时';
        } else if (error.message.includes('API密钥')) {
            errorMessage = 'API密钥配置错误';
        }
        
        res.status(statusCode).json({
            success: false,
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
            timestamp: new Date().toISOString()
        });
    }
};