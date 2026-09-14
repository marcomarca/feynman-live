import type { PortablePromptInput } from "../domain/portable-prompt";
import { formatPortablePrompt } from "../domain/portable-prompt";

export interface PortablePromptCompiler {
  compile(input: PortablePromptInput): string;
}

export class DefaultPortablePromptCompiler implements PortablePromptCompiler {
  compile(input: PortablePromptInput): string {
    return formatPortablePrompt(input);
  }
}

export const defaultCompiler = new DefaultPortablePromptCompiler();
