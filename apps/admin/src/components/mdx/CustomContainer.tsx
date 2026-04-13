"use client";

interface CustomContainerProps {
  type: "tip" | "warning" | "danger" | "info";
  title?: string;
  children?: React.ReactNode;
}

const CONTAINER_STYLES: Record<string, { border: string; bg: string; icon: string; defaultTitle: string }> = {
  tip: { border: "border-green-500", bg: "bg-green-50", icon: "💡", defaultTitle: "TIP" },
  warning: { border: "border-yellow-500", bg: "bg-yellow-50", icon: "⚠️", defaultTitle: "WARNING" },
  danger: { border: "border-red-500", bg: "bg-red-50", icon: "🚨", defaultTitle: "DANGER" },
  info: { border: "border-blue-500", bg: "bg-blue-50", icon: "ℹ️", defaultTitle: "INFO" },
};

export function CustomContainer({ type, title, children }: CustomContainerProps) {
  const style = CONTAINER_STYLES[type] || CONTAINER_STYLES.info;

  return (
    <div className={`my-4 border-l-4 ${style.border} ${style.bg} rounded-r-lg p-4 not-prose`}>
      <p className="font-bold text-sm mb-1">
        {style.icon} {title || style.defaultTitle}
      </p>
      <div className="text-sm text-gray-700">{children}</div>
    </div>
  );
}
