// Configuration
const MINUTES_INTERVAL = 12 * 60;
const WEBFLOW_API_KEY = '65dbec126bedb2c76dbdf0a4b1c8ee695983f0224e5a17277f311c130487cca5';
const COLLECTION_ID = '67dc46532575e8231ca7988c';
const CHECK_INTERVAL = MINUTES_INTERVAL * 60 * 1000; // 5 minutes en millisecondes

async function scrapeJobs() {
  try {
    const response = await fetch("https://zeno-power.breezy.hr/");
    const html = await response.text();
    const jobs = [];

    // Utilisation de DOMParser au lieu de cheerio (pas de dépendance npm)
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const positions = doc.querySelectorAll('.position');

    positions.forEach(element => {
      const title = element.querySelector('h2').textContent.trim();
      const department = element.querySelector('.department').textContent.trim();
      const location = element.querySelector('.location').textContent.trim();
      const link = element.querySelector('a').getAttribute('href');
      const comp = element.querySelector('[title="Salary"]')?.textContent.trim() || '';
      const slug = link?.split("/").pop();

      const typeSpan = element.querySelector('.type span');
      const typeText = typeSpan?.textContent.trim();
      const type = 
        typeText === '%LABEL_POSITION_TYPE_FULL_TIME%' ? 'Full-Time' :
        typeText === '%LABEL_POSITION_TYPE_PART_TIME%' ? 'Part-Time' :
        typeText === '%LABEL_POSITION_TYPE_CONTRACT%' ? 'Contract' : '';

      jobs.push({
        title,
        department,
        location,
        link: link ? `https://zeno-power.breezy.hr${link}` : null,
        comp,
        slug: slug || null,
        type
      });
    });

    return jobs;
  } catch (error) {
    console.error('Erreur lors du scraping des jobs:', error);
    return [];
  }
}

async function getOpenings() {
  try {
    const response = await fetch(`https://api.webflow.com/collections/${COLLECTION_ID}/items`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${WEBFLOW_API_KEY}`
      }
    });
    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Erreur lors de la récupération des openings:', error);
    return [];
  }
}

function matchJobsToOpenings(jobs, openings) {
  const newJobs = jobs.filter(
    job => !openings.some(opening => opening.slug === job.slug)
  );

  const jobsToRemove = openings.filter(
    opening => !jobs.some(job => job.slug === opening.slug)
  );

  return { newJobs, jobsToRemove };
}

async function addJobToWebflow(job) {
  try {
    const response = await fetch(`https://api.webflow.com/collections/${COLLECTION_ID}/items`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${WEBFLOW_API_KEY}`
      },
      body: JSON.stringify({
        fields: {
          name: job.title,
          slug: job.slug,
          location: job.location,
          type: job.type,
          url: job.slug,
          comp: job.comp
        }
      })
    });
    return await response.json();
  } catch (error) {
    console.error('Erreur lors de l\'ajout du job:', error);
    return null;
  }
}

async function removeJobFromWebflow(jobId) {
  try {
    const response = await fetch(`https://api.webflow.com/collections/${COLLECTION_ID}/items/${jobId}`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${WEBFLOW_API_KEY}`
      }
    });
    return await response.json();
  } catch (error) {
    console.error('Erreur lors de la suppression du job:', error);
    return null;
  }
}

async function syncJobs() {
  console.log('Début de la synchronisation...');
  
  try {
    const [jobs, openings] = await Promise.all([
      scrapeJobs(),
      getOpenings()
    ]);

    const { newJobs, jobsToRemove } = matchJobsToOpenings(jobs, openings);
    
    console.log(`${newJobs.length} nouveaux jobs à ajouter`);
    console.log(`${jobsToRemove.length} jobs à supprimer`);

    // Ajouter les nouveaux jobs
    for (const job of newJobs) {
      await addJobToWebflow(job);
      console.log(`Job ajouté: ${job.title}`);
    }

    // Supprimer les jobs qui n'existent plus
    for (const job of jobsToRemove) {
      await removeJobFromWebflow(job._id);
      console.log(`Job supprimé: ${job.name}`);
    }

    console.log('Synchronisation terminée avec succès');
  } catch (error) {
    console.error('Erreur pendant la synchronisation:', error);
  }
}

// Démarrer la synchronisation initiale
syncJobs();

// Mettre en place la synchronisation périodique
setInterval(syncJobs, CHECK_INTERVAL);

// Pour éviter que le script ne se termine
console.log('Script de synchronisation démarré. Vérification toutes les 5 minutes...');

async function handleSync(request) {
  try {
    await syncJobs();
    return {
      status: 'success',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'error',
      message: error.message
    };
  }
}

// Export de la fonction pour jsDelivr
window.zenoSync = handleSync;