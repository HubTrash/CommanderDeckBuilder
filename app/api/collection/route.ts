import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const COLLECTION_PATH = path.join(process.cwd(), 'data', 'collection.json');

export async function GET() {
    try {
        const data = await fs.readFile(COLLECTION_PATH, 'utf-8');
        const collection = JSON.parse(data);
        return NextResponse.json({ collection });
    } catch (error) {
        console.error('Error reading collection:', error);
        return NextResponse.json({ collection: [] });
    }
}
