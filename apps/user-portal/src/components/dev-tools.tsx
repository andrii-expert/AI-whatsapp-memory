"use client";

import { useState } from "react";
import { Button } from "@imaginecalendar/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@imaginecalendar/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@imaginecalendar/ui/alert";
import { Input } from "@imaginecalendar/ui/input";
import { Label } from "@imaginecalendar/ui/label";
import { Checkbox } from "@imaginecalendar/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@imaginecalendar/ui/dialog";
import { AlertTriangle, Trash2, Users, Database } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { toast } from "@imaginecalendar/ui/use-toast";
import { useClerk } from "@clerk/nextjs";
export function DevTools() {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [keepCurrentUser, setKeepCurrentUser] = useState(true);
  const trpc = useTRPC();
  const { signOut } = useClerk();

  // Get user statistics
  const { data: stats, refetch: refetchStats } = useQuery(
    trpc.dev.getUserStats.queryOptions()
  );

  // Delete all users mutation
  const deleteAllUsersMutation = useMutation(
    trpc.dev.deleteAllUsers.mutationOptions({
      onSuccess: async (data) => {
        toast({
          title: "Users Deleted",
          description: `Deleted ${data.deletedCount} users${data.errors.length > 0 ? ` with ${data.errors.length} errors` : ""}`
        });
        
        if (data.errors.length > 0) {
          data.errors.forEach((error) => {
            toast({
              title: "Deletion Error",
              description: `Failed to delete ${error.email}: ${error.error}`,
              variant: "destructive"
            });
          });
        }
        
        setDeleteDialogOpen(false);
        setConfirmPhrase("");
        
        // If current user was NOT kept, sign out
        if (!data.keptCurrentUser) {
          await signOut();
        } else {
          // Otherwise just refresh stats
          refetchStats();
        }
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: `Failed to delete users: ${error.message}`,
          variant: "destructive"
        });
      },
    })
  );

  const canDelete = confirmPhrase === "DELETE ALL USERS";

  return (
    <Card className="border-destructive/50 bg-destructive/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Developer Tools
        </CardTitle>
        <CardDescription>
          Dangerous operations for development and testing only
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* User Statistics */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center gap-3">
            <Database className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Database Users</p>
              <p className="text-2xl font-bold">{stats?.databaseUserCount ?? 0}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Clerk Users</p>
              <p className="text-2xl font-bold">{stats?.clerkUserCount ?? 0}</p>
            </div>
          </div>
        </div>

        {/* User List */}
        {stats?.users && stats.users.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Current Users:</h4>
            <div className="rounded-md border">
              <div className="max-h-48 overflow-y-auto p-2">
                {stats.users.map((user) => (
                  <div key={user.id} className="flex items-center justify-between py-1 px-2 hover:bg-muted/50 rounded">
                    <span className="text-sm">{user.email}</span>
                    <span className="text-xs text-muted-foreground">{user.name || "No name"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Delete All Users */}
        <Alert className="border-destructive bg-destructive/10">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Danger Zone</AlertTitle>
          <AlertDescription className="space-y-4">
            <p>
              Delete all users from both the database and Clerk. This action cannot be undone.
            </p>
            
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" className="gap-2">
                  <Trash2 className="h-4 w-4" />
                  Delete All Users
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="text-destructive">
                    ⚠️ Delete All Users
                  </DialogTitle>
                  <DialogDescription className="space-y-3">
                    <p>
                      This will permanently delete all users from both the database and Clerk.
                      This action cannot be undone.
                    </p>
                    <Alert className="border-destructive">
                      <AlertDescription>
                        <strong>This will delete:</strong>
                        <ul className="mt-2 list-disc list-inside text-sm">
                          <li>All user accounts</li>
                          <li>All subscriptions</li>
                          <li>All payment records</li>
                          <li>All calendar connections</li>
                          <li>All WhatsApp numbers</li>
                          <li>All activity logs</li>
                        </ul>
                      </AlertDescription>
                    </Alert>
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="keep-current"
                      checked={keepCurrentUser}
                      onCheckedChange={(checked) => setKeepCurrentUser(checked as boolean)}
                    />
                    <Label htmlFor="keep-current">
                      Keep my current user account
                    </Label>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="confirm-phrase">
                      Type <strong>DELETE ALL USERS</strong> to confirm:
                    </Label>
                    <Input
                      id="confirm-phrase"
                      value={confirmPhrase}
                      onChange={(e) => setConfirmPhrase(e.target.value)}
                      placeholder="DELETE ALL USERS"
                      className="font-mono"
                    />
                  </div>
                </div>
                
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDeleteDialogOpen(false);
                      setConfirmPhrase("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={!canDelete || deleteAllUsersMutation.isPending}
                    onClick={() => {
                      if (canDelete) {
                        deleteAllUsersMutation.mutate({
                          confirmPhrase: "DELETE ALL USERS",
                          keepCurrentUser,
                        });
                      }
                    }}
                  >
                    {deleteAllUsersMutation.isPending ? "Deleting..." : "Delete All Users"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}