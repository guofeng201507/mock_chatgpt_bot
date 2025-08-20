// lib/azure.ts
import {AzureOpenAI} from "openai";


export const azure = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY!,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-10-21",
});


export const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT!; // e.g. "gpt-4o"