import AdminSidebar from "@/components/admin/AdminSidebar";

export const metadata = {
  title: "Admin — CatDai",
};

export default function AdminLayout({ children }) {
  return (
    <div className="min-h-screen flex bg-gray-50">
      <AdminSidebar />
      <main className="flex-1 overflow-auto p-6 lg:p-8">{children}</main>
    </div>
  );
}
