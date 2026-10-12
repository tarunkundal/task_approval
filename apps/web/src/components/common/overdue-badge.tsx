import { TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function OverdueBadge() {
  return (
    <Badge variant="outline" className="border-red-300 bg-red-50 text-red-800">
      <TriangleAlert aria-hidden="true" />
      Overdue
    </Badge>
  );
}
