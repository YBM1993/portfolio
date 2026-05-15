// Teacher Portfolio Polaroid Gallery - Main JavaScript
class TeacherPortfolioGallery {
    constructor() {
        this.polaroids = [];
        this.isDragging = false;
        this.currentDrag = null;
        this.dragOffset = { x: 0, y: 0 };
        this.audioContext = null;
        this.ambientAudio = null;
        this.flipSound = null;
        
        // STEM ұстазының портфолиосынан алынған сәттер
        this.polaroidData = [
            {
                id: 'first_lesson',
                character: 'Информатика сабағы',
                location: 'Төле би атындағы орта мектеп',
                imageHint: 'сурет: сыныптағы сабақ',
                caption: 'Кабинетіміз',
                description: 'Күнделікті информатика сабағы. Әрбір баланың алдында — ноутбук, көзінде — қызығушылық.',
                date: 'қыркүйек, 2025',
                tags: ['информатика', 'сабақ'],
                position: { x: 150, y: 200 },
                rotation: 5
            },
            {
                id: 'codiplay_moodflower',
                character: 'Moodflower командасы',
                location: 'CodiPlay «Болашақ жобасы»',
                imageHint: 'сурет: codiplay i орын',
                caption: 'I орын · 500 000 ₸',
                description: 'Орынбас Ақжан, Ақжол Інжу (9-сынып) — «Үздік креативті бейне» номинациясының жеңімпаздары. Кореяға сапар сыйлыққа берілді.',
                date: '23 мамыр, 2025',
                tags: ['codiplay', 'жеңіс', 'ментор'],
                position: { x: 400, y: 150 },
                rotation: -3
            },
            {
                id: 'codiplay_greenbox',
                character: 'Greenbox командасы',
                location: 'CodiPlay «Болашақ жобасы»',
                imageHint: 'сурет: greenbox команда',
                caption: 'II орын · 200 000 ₸',
                description: 'Лазгиев Онур, Гаврилин Данил (9-сынып) — «Үздік техникалық жоба» номинациясы. Идея өмірге кірді.',
                date: 'мамыр, 2025',
                tags: ['codiplay', 'жоба', 'команда'],
                position: { x: 650, y: 250 },
                rotation: 2
            },
            {
                id: 'tiktok_blog',
                character: '@mr.agai',
                location: 'STEM-блог · TikTok',
                imageHint: 'сурет: блог жазу',
                caption: '49 600 жазылушы',
                description: 'TikTok-тағы STEM-блогым. 1 миллионнан астам лайк. Ғылымды жастар тілінде сөйлету — өз міндетім.',
                date: '2024–2025',
                tags: ['tiktok', 'stem', 'блог'],
                position: { x: 200, y: 450 },
                rotation: -4
            },
            {
                id: 'almaty_tech_cup',
                character: 'Almaty Tech Cup',
                location: 'Алматы қаласы',
                imageHint: 'сурет: сахнада спикер',
                caption: 'Сахнада',
                description: '«STEM-блогер: ғылымды трендке айналдыр!» баяндамасы. Залдағы көздер — болашақ ұстаздардікі.',
                date: '2025',
                tags: ['спикер', 'tech cup'],
                position: { x: 500, y: 400 },
                rotation: 6
            },
            {
                id: 'nxplorers',
                character: 'NXplorers тренингі',
                location: 'Shell · Дарын · Caravan of Knowledge',
                imageHint: 'сурет: nxplorers сабағы',
                caption: '«Жасыл ұрпақ бәйгесі»',
                description: 'NXplorers тренері сертификаты № Nxpl-2025-St-104. Балаларды экологиялық ойлауға, жобалық тәсілге үйретеміз.',
                date: '2025',
                tags: ['nxplorers', 'shell', 'тренер'],
                position: { x: 750, y: 350 },
                rotation: -2
            },
            {
                id: 'robotics',
                character: 'Робототехника үйірмесі',
                location: 'Мектеп зертханасы',
                imageHint: 'сурет: робот құрастыру',
                caption: 'Робот құрастыру',
                description: 'KazRobo Project бағытындағы команда дайындау. Әр бұранда — баланың ізденісі.',
                date: '2024–2025',
                tags: ['робототехника', 'kazrobo'],
                position: { x: 300, y: 300 },
                rotation: 3
            },
            {
                id: 'inventor_oblast',
                character: 'Төлен Нүртілек',
                location: 'Қонаев · облыстық байқау',
                imageHint: 'сурет: жоба жетекшісі',
                caption: 'I орын · облыс',
                description: '«Ұлы өнертапқыштыққа алғашқы қадам» байқауы, «Құрылыс облысындағы жобалар» номинациясы. Шәкіртім — жеңімпаз.',
                date: '2025',
                tags: ['өнертапқыш', 'облыс'],
                position: { x: 600, y: 500 },
                rotation: -5
            },
            {
                id: 'best_informatics_teacher',
                character: '«Үздік информатика мұғалімі-2026»',
                location: 'Еңбекшіқазақ ауданы',
                imageHint: 'сурет: марапаттау',
                caption: 'II орын · аудан',
                description: '«Үздік информатика пән мұғалімі-2026» аудандық олимпиадасының жүлдегері. Ұстаздық — өсудің жалғасы.',
                date: '2026',
                tags: ['марапат', 'аудан'],
                position: { x: 450, y: 180 },
                rotation: 4
            },
            {
                id: 'stem_pedagog',
                character: '«STEM-педагог»',
                location: 'ӨРЛЕУ · Алматы қаласы',
                imageHint: 'сурет: республикалық байқау',
                caption: 'III орын · республика',
                description: 'Республикалық «STEM-педагог» байқауының жүлдегері. Ұстаздар арасында да бәсеке — өсудің тетігі.',
                date: '2025',
                tags: ['stem', 'республика', 'өрлеу'],
                position: { x: 350, y: 380 },
                rotation: -1
            },
            {
                id: 'crazy_steam',
                character: 'Crazy Steam Ideas',
                location: 'Chevron · MakerSpace · Zertте Studio',
                imageHint: 'сурет: steam-фестиваль',
                caption: 'Командамен',
                description: 'STEAM білім беруді қолдау іс-шарасы. Балалардың ұшқыр идеялары — болашақтың алғашқы прототиптері.',
                date: '2024',
                tags: ['steam', 'фестиваль'],
                position: { x: 550, y: 280 },
                rotation: 1
            },
            {
                id: 'august_council',
                character: 'Тамыз кеңесі',
                location: '«Жайлы мектеп» · Қаскелең',
                imageHint: 'сурет: панельдік сессия',
                caption: 'Панелист',
                description: 'Алматы облысының педагогтерінің тамыз кеңесінің панельдік сессиясы. 19 тамыз 2025 жыл.',
                date: '19 тамыз, 2025',
                tags: ['тамыз кеңесі', 'панелист'],
                position: { x: 150, y: 350 },
                rotation: -6
            },
            {
                id: 'hackathon_night',
                character: 'Түнгі хакатон',
                location: 'Мектеп · IT-зертхана',
                imageHint: 'сурет: түнгі кодинг',
                caption: '24 сағат · код',
                description: 'Шәкірттермен бірге өткізген 24 сағаттық хакатон. Шай, идея және алғашқы прототиптер таңмен бірге туды.',
                date: 'қараша, 2024',
                tags: ['хакатон', 'код', 'команда'],
                position: { x: 700, y: 180 },
                rotation: 4
            },
            {
                id: 'ai_workshop',
                character: 'AI-семинары',
                location: 'Алматы · педагогтерге арналған',
                imageHint: 'сурет: ai презентация',
                caption: 'Спикер',
                description: '«Мектепте жасанды интеллект: қалай қолданамыз?» тақырыбындағы практикалық семинар. 80-нен астам ұстаз қатысты.',
                date: 'ақпан, 2025',
                tags: ['ai', 'семинар', 'спикер'],
                position: { x: 280, y: 540 },
                rotation: -2
            },
            {
                id: 'scratch_club',
                character: 'Scratch үйірмесі',
                location: 'Бастауыш сынып · мектеп',
                imageHint: 'сурет: scratch ойындары',
                caption: '5-сынып',
                description: 'Кішкентай бағдарламашылардың алғашқы ойындары. Әр блок — өзіндік ертегі.',
                date: '2024–2025',
                tags: ['scratch', 'бастауыш'],
                position: { x: 480, y: 580 },
                rotation: 3
            },
            {
                id: 'drone_olympics',
                character: 'Дрон олимпиадасы',
                location: 'Алматы облысы',
                imageHint: 'сурет: дрон ұшыру',
                caption: 'Жетекші',
                description: 'Команда «AeroQazaq» — облыстық дрон-байқауда үшінші орын. Аспан — енді біздің сабақ кеңістігіміз.',
                date: 'сәуір, 2025',
                tags: ['дрон', 'олимпиада'],
                position: { x: 820, y: 480 },
                rotation: -5
            }
        ];
        
        this.init();
    }
    
    async init() {
        // Wait for page load
        window.addEventListener('load', async () => {
            // Hide loading screen
            setTimeout(() => {
                document.getElementById('loadingScreen').classList.add('hidden');
            }, 1000);
            
            // Initialize audio
            this.initAudio();
            
            // Create polaroids
            this.createPolaroids();
            
            // Initialize physics
            this.initPhysics();
            
            // Setup controls
            this.setupControls();
            
            // Initialize particles
            this.initParticles();
            
            // Start ambient audio
            this.startAmbientAudio();
        });
    }
    
    initAudio() {
        this.ambientAudio = document.getElementById('ambientAudio');
        this.flipSound = document.getElementById('flipSound');
        
        // Set initial volume
        this.ambientAudio.volume = 0.3;
        
        // Volume control
        const volumeSlider = document.getElementById('volumeSlider');
        volumeSlider.addEventListener('input', (e) => {
            this.ambientAudio.volume = e.target.value / 100;
        });
    }
    
    startAmbientAudio() {
        // Start playing ambient audio (requires user interaction first)
        document.addEventListener('click', () => {
            if (this.ambientAudio.paused) {
                this.ambientAudio.play().catch(e => console.log('Audio play failed:', e));
            }
        }, { once: true });
    }
    
    createPolaroids() {
        const container = document.getElementById('polaroidContainer');
        
        this.polaroidData.forEach((data, index) => {
            const polaroid = document.createElement('div');
            polaroid.className = 'polaroid';
            polaroid.id = data.id;
            polaroid.style.left = data.position.x + 'px';
            polaroid.style.top = data.position.y + 'px';
            polaroid.style.transform = `rotate(${data.rotation}deg)`;
            polaroid.style.zIndex = index + 1;
            
            polaroid.innerHTML = `
                <div class="polaroid-front">
                    <image-slot id="polaroid-${data.id}" shape="rect" radius="4" placeholder="${data.imageHint}" src="resources/images/${data.id}.webp" style="width:100%;height:160px;border-radius:4px;"></image-slot>
                    <div class="photo-caption">${data.caption}</div>
                </div>
                <div class="polaroid-back">
                    <div class="photo-description handwritten">${data.description}</div>
                    <div class="photo-date">${data.date}</div>
                </div>
            `;
            
            // Add event listeners
            polaroid.addEventListener('click', (e) => this.openLightbox(e, polaroid, data));
            polaroid.addEventListener('mousedown', (e) => this.startDrag(e, polaroid));
            polaroid.addEventListener('touchstart', (e) => this.startDrag(e, polaroid));

            // Image-slot inside polaroid: don't let its clicks flip/drag the card
            const slot = polaroid.querySelector('image-slot');
            if (slot) {
                ['mousedown', 'click', 'dblclick', 'touchstart', 'dragover', 'drop']
                    .forEach(ev => slot.addEventListener(ev, e => e.stopPropagation()));
            }
            
            container.appendChild(polaroid);
            this.polaroids.push({ element: polaroid, data: data });
        });
        
        // Animate polaroids in
        anime({
            targets: '.polaroid',
            opacity: [0, 1],
            scale: [0.8, 1],
            rotate: (el, i) => this.polaroidData[i].rotation,
            duration: 800,
            delay: anime.stagger(100),
            easing: 'easeOutElastic(1, .8)'
        });
    }
    
    flipPolaroid(event, polaroid, data) {
        event.stopPropagation();
        
        // Don't flip if dragging
        if (this.isDragging) return;
        
        // Play flip sound
        this.flipSound.currentTime = 0;
        this.flipSound.play().catch(e => console.log('Sound play failed:', e));
        
        const isFlipped = polaroid.classList.contains('flipped');
        
        if (isFlipped) {
            polaroid.classList.remove('flipped');
            anime({
                targets: polaroid,
                rotateY: 0,
                duration: 600,
                easing: 'easeInOutQuad'
            });
        } else {
            polaroid.classList.add('flipped');
            anime({
                targets: polaroid,
                rotateY: 180,
                duration: 600,
                easing: 'easeInOutQuad'
            });
        }
        
        // Bring to front
        this.bringToFront(polaroid);
    }

    openLightbox(event, polaroid, data) {
        event.stopPropagation();

        // Don't open if the user just dragged
        if (this.justDragged) {
            this.justDragged = false;
            return;
        }

        this.bringToFront(polaroid);
        this.currentLightboxIndex = this.polaroidData.findIndex(p => p.id === data.id);
        this.renderLightbox(data);

        const lightbox = document.getElementById('lightbox');
        lightbox.classList.add('open');
        lightbox.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        // Soft flip-page sound on open
        if (this.flipSound) {
            this.flipSound.currentTime = 0;
            this.flipSound.play().catch(() => {});
        }
    }

    renderLightbox(data) {
        document.getElementById('lightboxEyebrow').textContent = data.location || '';
        document.getElementById('lightboxTitle').textContent = data.character || '';

        const meta = document.getElementById('lightboxMeta');
        meta.innerHTML = '';
        if (data.caption) {
            const c = document.createElement('span');
            c.textContent = data.caption;
            meta.appendChild(c);
        }
        if (data.date) {
            const d = document.createElement('span');
            d.textContent = data.date;
            meta.appendChild(d);
        }

        document.getElementById('lightboxDesc').textContent = data.description || '';

        const tagsEl = document.getElementById('lightboxTags');
        tagsEl.innerHTML = '';
        (data.tags || []).forEach(tag => {
            const t = document.createElement('span');
            t.className = 'lightbox-tag';
            t.textContent = '#' + tag;
            tagsEl.appendChild(t);
        });

        // Mirror the same image-slot id so user-dropped image persists across views
        const media = document.getElementById('lightboxMedia');
        media.innerHTML = `<image-slot id="polaroid-${data.id}" shape="rect" radius="8" placeholder="${data.imageHint}" src="resources/images/${data.id}.webp"></image-slot>`;
    }

    closeLightbox() {
        const lightbox = document.getElementById('lightbox');
        lightbox.classList.remove('open');
        lightbox.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    navigateLightbox(direction) {
        const total = this.polaroidData.length;
        this.currentLightboxIndex = (this.currentLightboxIndex + direction + total) % total;
        this.renderLightbox(this.polaroidData[this.currentLightboxIndex]);
    }
    
    startDrag(event, polaroid) {
        event.preventDefault();
        
        this.isDragging = true;
        this.dragMoved = false;
        this.currentDrag = polaroid;
        
        const rect = polaroid.getBoundingClientRect();
        const clientX = event.clientX || event.touches[0].clientX;
        const clientY = event.clientY || event.touches[0].clientY;
        
        this.dragStartPos = { x: clientX, y: clientY };
        this.dragOffset.x = clientX - rect.left;
        this.dragOffset.y = clientY - rect.top;
        
        polaroid.style.cursor = 'grabbing';
        polaroid.style.zIndex = 1000;
        
        // Add move and end event listeners
        document.addEventListener('mousemove', this.drag.bind(this));
        document.addEventListener('mouseup', this.endDrag.bind(this));
        document.addEventListener('touchmove', this.drag.bind(this));
        document.addEventListener('touchend', this.endDrag.bind(this));
    }
    
    drag(event) {
        if (!this.isDragging || !this.currentDrag) return;
        
        event.preventDefault();
        
        const clientX = event.clientX || event.touches[0].clientX;
        const clientY = event.clientY || event.touches[0].clientY;

        // Only count as a real drag once the user moves a few pixels
        if (this.dragStartPos) {
            const dx = clientX - this.dragStartPos.x;
            const dy = clientY - this.dragStartPos.y;
            if (Math.hypot(dx, dy) > 5) this.dragMoved = true;
        }
        
        const x = clientX - this.dragOffset.x;
        const y = clientY - this.dragOffset.y;
        
        this.currentDrag.style.left = x + 'px';
        this.currentDrag.style.top = y + 'px';
        
        // Add slight rotation during drag
        const rotation = Math.random() * 4 - 2;
        this.currentDrag.style.transform = `rotate(${rotation}deg)`;
    }
    
    endDrag() {
        if (!this.isDragging || !this.currentDrag) return;
        
        this.isDragging = false;
        // Block the click event that follows a real drag
        this.justDragged = this.dragMoved;
        this.currentDrag.style.cursor = 'pointer';
        
        // Reset rotation to original
        const data = this.polaroidData.find(p => p.id === this.currentDrag.id);
        if (data) {
            this.currentDrag.style.transform = `rotate(${data.rotation}deg)`;
        }
        
        this.currentDrag = null;
        
        // Remove event listeners
        document.removeEventListener('mousemove', this.drag.bind(this));
        document.removeEventListener('mouseup', this.endDrag.bind(this));
        document.removeEventListener('touchmove', this.drag.bind(this));
        document.removeEventListener('touchend', this.endDrag.bind(this));
    }
    
    bringToFront(polaroid) {
        // Find current max z-index
        const maxZIndex = Math.max(...this.polaroids.map(p => 
            parseInt(p.element.style.zIndex) || 0
        ));
        
        polaroid.style.zIndex = maxZIndex + 1;
    }
    
    initPhysics() {
        // Initialize Matter.js for collision detection
        const Engine = Matter.Engine;
        const World = Matter.World;
        const Bodies = Matter.Bodies;
        
        this.engine = Engine.create();
        this.world = this.engine.world;
        
        // Create boundaries (invisible walls)
        const container = document.getElementById('polaroidContainer');
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        const boundaries = [
            Bodies.rectangle(width/2, -25, width, 50, { isStatic: true }), // Top
            Bodies.rectangle(width/2, height + 25, width, 50, { isStatic: true }), // Bottom
            Bodies.rectangle(-25, height/2, 50, height, { isStatic: true }), // Left
            Bodies.rectangle(width + 25, height/2, 50, height, { isStatic: true }) // Right
        ];
        
        World.add(this.world, boundaries);
        
        // Start physics engine
        Engine.run(this.engine);
    }
    
    setupControls() {
        // Shuffle button
        document.getElementById('shuffleBtn').addEventListener('click', () => {
            this.shufflePolaroids();
        });
        
        // Grid button
        document.getElementById('gridBtn').addEventListener('click', () => {
            this.arrangeInGrid();
        });
        
        // Stack button
        document.getElementById('stackBtn').addEventListener('click', () => {
            this.stackPolaroids();
        });
        
        // Timeline button
        document.getElementById('timelineBtn').addEventListener('click', () => {
            this.arrangeInTimeline();
        });

        // Lightbox close/nav
        const lightbox = document.getElementById('lightbox');
        document.getElementById('lightboxClose').addEventListener('click', () => this.closeLightbox());
        document.getElementById('lightboxPrev').addEventListener('click', (e) => {
            e.stopPropagation();
            this.navigateLightbox(-1);
        });
        document.getElementById('lightboxNext').addEventListener('click', (e) => {
            e.stopPropagation();
            this.navigateLightbox(1);
        });
        // Click backdrop to close
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) this.closeLightbox();
        });
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (!lightbox.classList.contains('open')) return;
            if (e.key === 'Escape') this.closeLightbox();
            else if (e.key === 'ArrowRight') this.navigateLightbox(1);
            else if (e.key === 'ArrowLeft') this.navigateLightbox(-1);
        });
    }
    
    shufflePolaroids() {
        const container = document.getElementById('polaroidContainer');
        const containerRect = container.getBoundingClientRect();
        
        this.polaroids.forEach((polaroid, index) => {
            const randomX = Math.random() * (containerRect.width - 200);
            const randomY = Math.random() * (containerRect.height - 240);
            const randomRotation = Math.random() * 20 - 10;
            
            anime({
                targets: polaroid.element,
                left: randomX,
                top: randomY,
                rotate: randomRotation,
                duration: 800,
                delay: index * 50,
                easing: 'easeOutElastic(1, .8)'
            });
        });
    }
    
    arrangeInGrid() {
        const cols = 4;
        const spacing = 220;
        const startX = 100;
        const startY = 150;
        
        this.polaroids.forEach((polaroid, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const x = startX + col * spacing;
            const y = startY + row * (spacing + 20);
            
            anime({
                targets: polaroid.element,
                left: x,
                top: y,
                rotate: 0,
                duration: 600,
                delay: index * 100,
                easing: 'easeOutQuad'
            });
        });
    }
    
    stackPolaroids() {
        const stackX = window.innerWidth / 2 - 100;
        const stackY = window.innerHeight / 2 - 120;
        
        this.polaroids.forEach((polaroid, index) => {
            const offsetX = (Math.random() - 0.5) * 20;
            const offsetY = index * 3;
            const rotation = (Math.random() - 0.5) * 10;
            
            anime({
                targets: polaroid.element,
                left: stackX + offsetX,
                top: stackY + offsetY,
                rotate: rotation,
                duration: 600,
                delay: index * 50,
                easing: 'easeOutQuad'
            });
        });
    }
    
    arrangeInTimeline() {
        const startX = 50;
        const startY = window.innerHeight / 2;
        const spacing = 180;
        
        this.polaroids.forEach((polaroid, index) => {
            const x = startX + index * spacing;
            const y = startY + Math.sin(index * 0.5) * 30;
            const rotation = Math.sin(index * 0.3) * 5;
            
            anime({
                targets: polaroid.element,
                left: x,
                top: y,
                rotate: rotation,
                duration: 600,
                delay: index * 80,
                easing: 'easeOutQuad'
            });
        });
    }
    
    initParticles() {
        // Simple particle system using p5.js
        const particleContainer = document.getElementById('particleContainer');
        
        // Create floating dust particles
        for (let i = 0; i < 20; i++) {
            const particle = document.createElement('div');
            particle.style.position = 'absolute';
            particle.style.width = '2px';
            particle.style.height = '2px';
            particle.style.background = 'rgba(212, 175, 55, 0.3)';
            particle.style.borderRadius = '50%';
            particle.style.pointerEvents = 'none';
            
            const x = Math.random() * window.innerWidth;
            const y = Math.random() * window.innerHeight;
            
            particle.style.left = x + 'px';
            particle.style.top = y + 'px';
            
            particleContainer.appendChild(particle);
            
            // Animate particle
            anime({
                targets: particle,
                translateY: -100,
                translateX: Math.random() * 100 - 50,
                opacity: [0, 0.6, 0],
                duration: Math.random() * 10000 + 5000,
                loop: true,
                easing: 'linear'
            });
        }
    }
}

// Initialize gallery when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TeacherPortfolioGallery();
});

// Handle window resize
window.addEventListener('resize', () => {
    // Recalculate positions if needed
    console.log('Window resized - consider implementing responsive adjustments');
});

// Add some easter eggs for true Addams Family fans
const konamiCode = [];
const konamiSequence = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65];

document.addEventListener('keydown', (e) => {
    konamiCode.push(e.keyCode);
    if (konamiCode.length > konamiSequence.length) {
        konamiCode.shift();
    }
    
    if (konamiCode.join(',') === konamiSequence.join(',')) {
        // Easter egg — STEM ұраны
        const message = document.createElement('div');
        message.innerHTML = '✨ Ґылымды жастар тілінде сөйлеткен ұстаз — дәңгер өзгертеді ✨';
        message.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(255, 253, 247, 0.96);
            color: #b8893a;
            padding: 22px 44px;
            border-radius: 14px;
            font-size: 22px;
            font-family: 'Playfair Display', serif;
            z-index: 10000;
            border: 1px solid rgba(184, 137, 58, 0.4);
            box-shadow: 0 12px 40px rgba(74, 67, 56, 0.15);
        `;
        document.body.appendChild(message);
        
        setTimeout(() => {
            message.remove();
        }, 2400);
    }
});