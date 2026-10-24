"use client";

import React, { useRef, useState } from 'react';
import Papa from "papaparse";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Loader2, Upload, Send, BarChart3 } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import type { SentimentAnalysis } from "@/lib/sentiment";

function sentimentBadgeClass(sentiment: string): string {
  const s = sentiment.toLowerCase();
  if (s.includes("neg")) return "bg-red-500 hover:bg-red-600";
  if (s.includes("pos")) return "bg-green-500 hover:bg-green-600";
  return "bg-slate-500 hover:bg-slate-600";
}

export default function SentimentDashboard() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState("");
  const [result, setResult] = useState<SentimentAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bulkFileName, setBulkFileName] = useState<string | null>(null);

  // const handleAnalyze = () => {
  //   setLoading(true);
  //   // Simulating AI delay
  //   setTimeout(() => {
  //     setResult(true);
  //     setLoading(false);
  //   }, 2000);
  // };

  const runAnalysis = async (payload: { text?: string; texts?: string[] }) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Analysis failed");
      }
      setResult(data);
    } catch (err) {
      console.error("Error analyzing sentiment:", err);
      setError(err instanceof Error ? err.message : "Something went wrong");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = () => {
    if (!inputText.trim()) return;
    void runAnalysis({ text: inputText.trim() });
  };

  const handleBulkFile = (file: File) => {
    setBulkFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (parsed) => {
        const fields = parsed.meta.fields ?? [];
        const textKey =
          fields.find((f) => f.toLowerCase() === "text") ??
          fields.find((f) => f.toLowerCase().includes("text")) ??
          fields[0];

        if (!textKey) {
          setError("CSV must include a header row with a 'text' column.");
          return;
        }

        const texts = parsed.data
          .map((row) => String(row[textKey] ?? "").trim())
          .filter(Boolean);

        if (texts.length === 0) {
          setError("No text rows found in the CSV.");
          return;
        }

        void runAnalysis({ texts });
      },
      error: (parseError) => {
        setError(parseError.message || "Could not parse CSV file.");
      },
    });
  };

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-10 flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Sentimerce AI</h1>
          <p className="text-muted-foreground mt-2">Analyze social media sentiment with Gemini 1.5</p>
        </div>
        <ThemeToggle />
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Input Section */}
        <div className="lg:col-span-1 space-y-6">
          <Tabs defaultValue="single" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="single">Single Text</TabsTrigger>
              <TabsTrigger value="bulk">Bulk CSV</TabsTrigger>
            </TabsList>
            
            <TabsContent value="single">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Paste Content</CardTitle>
                  <CardDescription>Enter the social media post or comment below.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea 
                    placeholder="e.g., I just bought the new phone and it's amazing, but the battery life is terrible!" 
                    className="min-h-[150px] resize-none"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                  />
                  <Button 
                    className="w-full gap-2" 
                    onClick={handleAnalyze} 
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="animate-spin" /> : <Send size={18} />}
                    {loading ? "Analyzing..." : "Analyze Sentiment"}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="bulk">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Upload Data</CardTitle>
                  <CardDescription>Upload a CSV file with a 'text' column.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center py-10 border-2 border-dashed rounded-lg">
                  <Upload className="text-muted-foreground mb-4" size={40} />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleBulkFile(file);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    variant="secondary"
                    disabled={loading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {loading ? "Analyzing..." : "Select CSV File"}
                  </Button>
                  {bulkFileName && (
                    <p className="text-xs text-muted-foreground mt-3">{bulkFileName}</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Column: Results Section */}
        <div className="lg:col-span-2 space-y-6">
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {!result && !loading ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-10 border rounded-xl bg-card/50">
              <BarChart3 size={60} className="text-muted-foreground/20 mb-4" />
              <h3 className="text-xl font-medium text-muted-foreground">No analysis yet</h3>
              <p className="text-sm text-muted-foreground/60">Enter some text on the left to see the magic happen.</p>
            </div>
          ) : loading && !result ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card><CardContent className="pt-6"><Skeleton className="h-[250px] w-full" /></CardContent></Card>
              <Card><CardContent className="pt-6"><Skeleton className="h-[250px] w-full" /></CardContent></Card>
              <Card className="md:col-span-2"><CardContent className="pt-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
            </div>
          ) : result ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-500">
              
              {/* Sentiment Distribution Pie Chart */}
              <Card className="col-span-1">
                <CardHeader>
                  <CardTitle className="text-md">Sentiment Distribution</CardTitle>
                </CardHeader>
                <CardContent className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={result.pieData}
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {result.pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Emotion Breakdown Bar Chart */}
              <Card className="col-span-1">
                <CardHeader>
                  <CardTitle className="text-md">Emotion Analysis</CardTitle>
                </CardHeader>
                <CardContent className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={result.emotions}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip />
                      <Bar dataKey="score" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Detailed Summary Card */}
              <Card className="md:col-span-2">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-lg">Analysis Summary</CardTitle>
                    <Badge variant="default" className={sentimentBadgeClass(result.sentiment)}>
                      {result.sentiment}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">
                    {result.summary}
                  </p>
                </CardContent>
              </Card>

            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}