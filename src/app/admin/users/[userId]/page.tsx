import type { Metadata } from "next";

import { PersonView } from "@/components/admin/person-view";

interface Props {
  params: Promise<{ userId: string }>;
}

// The login ID as it stands in the address. A character such as "@" arrives
// here still encoded.
function loginId(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Admin: ${loginId((await params).userId)}` };
}

export default async function AdminPersonPage({ params }: Props) {
  return <PersonView userId={loginId((await params).userId)} />;
}
