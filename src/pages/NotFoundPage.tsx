import { useNavigate } from "react-router-dom";
import { ModusWcTypography, ModusWcButton, ModusWcIcon } from "@trimble-oss/moduswebcomponents-react";

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-6">
      <ModusWcIcon name="error_outline" size="xl" decorative customClass="text-[var(--modus-wc-color-base-300)]" />
      <ModusWcTypography hierarchy="h4" size="xl" weight="bold" label="Page not found" customClass="m-0 text-[var(--modus-wc-color-base-content)]" />
      <ModusWcTypography hierarchy="p" size="sm" label="The page you're looking for doesn't exist." customClass="m-0 text-[var(--modus-wc-color-base-content-low-contrast)]" />
      <ModusWcButton variant="filled" color="primary" size="md" onButtonClick={() => navigate("/")}>
        Go home
      </ModusWcButton>
    </div>
  );
}
