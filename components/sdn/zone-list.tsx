"use client";

import { useZones } from "@/lib/swr-hooks";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateZoneDialog } from "./create-zone-dialog";

export function ZoneList() {
    const { zones, isLoading, isError } = useZones();

    if (isError) return <div className="text-destructive">Failed to load zones</div>;

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>SDN Zones</CardTitle>
                <CreateZoneDialog />
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Zone</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>MTU</TableHead>
                            <TableHead>IPAM</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center">Loading...</TableCell>
                            </TableRow>
                        ) : zones && zones.length > 0 ? (
                            zones.map((zone) => (
                                <TableRow key={zone.zone}>
                                    <TableCell className="font-medium">{zone.zone}</TableCell>
                                    <TableCell>{zone.type}</TableCell>
                                    <TableCell>{zone.mtu}</TableCell>
                                    <TableCell>{zone.ipam}</TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center text-muted-foreground">No zones found</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
