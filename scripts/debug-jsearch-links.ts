
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const JSEARCH_API_KEY = process.env.VITE_RAPIDAPI_KEY;

const main = async () => {
    const url = 'https://jsearch.p.rapidapi.com/search';
    const query = 'Software Engineer';

    console.log(`Querying JSearch (ALL): ${query}`);

    const options = {
        method: 'GET',
        headers: {
            'x-rapidapi-key': JSEARCH_API_KEY!,
            'x-rapidapi-host': 'jsearch.p.rapidapi.com'
        }
    };

    try {
        const fetchUrl = `${url}?query=${encodeURIComponent(query)}&page=1&num_pages=1&date_posted=month&country=us`;
        const response = await fetch(fetchUrl, options);
        const data = await response.json();

        const jobs = data.data || [];
        console.log(`Returned ${jobs.length} jobs.`);
        jobs.forEach((j: any) => console.log(`[${j.job_title}] ${j.job_apply_link}`));
    } catch (error) {
        console.error('Error:', error);
    }
};

main();
