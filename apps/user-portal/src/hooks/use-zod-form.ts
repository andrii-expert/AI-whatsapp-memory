import { zodResolver } from "@hookform/resolvers/zod";
import { type UseFormProps, useForm } from "react-hook-form";
import type { ZodType, z } from "zod";

export const useZodForm = <TSchema extends ZodType<any, any, any>>(
  schema: TSchema,
  options?: Omit<UseFormProps<z.infer<TSchema>>, "resolver">,
) => {
  return useForm<z.infer<TSchema>>({
    resolver: zodResolver(schema as any),
    ...options,
  });
};