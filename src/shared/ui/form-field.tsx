import type { ReactNode } from "react";

export function FieldError({ id, message }: { id?: string; message?: string }) {
  return message ? (
    <p id={id} className="form-error" role="alert">
      {message}
    </p>
  ) : null;
}
export function FormField({
  id,
  label,
  required = false,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="form-field">
      <label htmlFor={id} className="field-label">
        {label}
        {required && (
          <span className="required-mark" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}
