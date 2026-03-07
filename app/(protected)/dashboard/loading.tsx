import { DashboardSkeleton } from '@/components/dashboard-wrappers'
import { DashboardShell } from '@/components/dashboard-shell'

export default function DashboardLoading() {
    return (
        <DashboardShell>
            <div className="max-w-7xl mx-auto space-y-6 md:space-y-12 pt-16 md:pt-24 pb-6 md:pb-12 px-6 md:px-8">
                <div className="space-y-4">
                    <DashboardSkeleton className="h-24 w-64 md:h-32 md:w-96 rounded-2xl" />
                    <DashboardSkeleton className="h-10 w-48 rounded-full" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-8 md:mt-12">
                    <DashboardSkeleton className="lg:col-span-4 h-32 w-full rounded-[2rem]" />
                    <DashboardSkeleton className="lg:col-span-1 h-32 w-full rounded-[2rem]" />
                    <DashboardSkeleton className="lg:col-span-1 h-32 w-full rounded-[2rem]" />
                    <DashboardSkeleton className="lg:col-span-1 h-32 w-full rounded-[2rem]" />
                    <DashboardSkeleton className="lg:col-span-1 h-32 w-full rounded-[2rem]" />
                    <DashboardSkeleton className="lg:col-span-2 h-[400px] w-full rounded-[2rem]" />
                    <DashboardSkeleton className="lg:col-span-2 h-[400px] w-full rounded-[2rem]" />
                </div>
            </div>
        </DashboardShell>
    )
}
