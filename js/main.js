/* ============================================
   ELEVATEX — Premium AI Automation Website
   Interactive JavaScript
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize all effects
    initCustomCursor();
    initNeuralGrid();
    initParticles();
    initScrollReveal();
    initHeader();
    initCountUp();
    initFormProgress();
    initMobileMenu();
    initParallax();
    initParticleBurst();
});

/* ============================================
   CUSTOM CURSOR
   ============================================ */

function initCustomCursor() {
    const cursor = document.getElementById('cursor');
    const trail = document.getElementById('cursorTrail');
    if (!cursor || !trail) return;

    let mouseX = 0, mouseY = 0;
    let trailX = 0, trailY = 0;

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;

        // Update main cursor
        cursor.style.left = `${mouseX}px`;
        cursor.style.top = `${mouseY}px`;
    });

    // Trail animation
    function animateTrail() {
        trailX += (mouseX - trailX) * 0.2;
        trailY += (mouseY - trailY) * 0.2;

        trail.style.left = `${trailX}px`;
        trail.style.top = `${trailY}px`;

        requestAnimationFrame(animateTrail);
    }
    animateTrail();

    // Hover effects
    const hoverElements = document.querySelectorAll('a, button, .service-card, .pricing-card, .process-step');

    hoverElements.forEach(el => {
        el.addEventListener('mouseenter', () => {
            cursor.classList.add('hovering');
        });
        el.addEventListener('mouseleave', () => {
            cursor.classList.remove('hovering');
        });
    });

    // Hide cursor when leaving window
    document.addEventListener('mouseleave', () => {
        cursor.style.opacity = '0';
        trail.style.opacity = '0';
    });

    document.addEventListener('mouseenter', () => {
        cursor.style.opacity = '1';
        trail.style.opacity = '0.5';
    });
}

/* ============================================
   NEURAL GRID ANIMATION
   ============================================ */

function initNeuralGrid() {
    const canvas = document.getElementById('neuralGrid');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let animationId;
    let nodes = [];
    const connectionDistance = 150;
    const nodeCount = 50;

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    resize();
    window.addEventListener('resize', resize);

    // Create nodes
    for (let i = 0; i < nodeCount; i++) {
        nodes.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            radius: Math.random() * 2 + 1
        });
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Update nodes
        nodes.forEach(node => {
            node.x += node.vx;
            node.y += node.vy;

            // Bounce off edges
            if (node.x < 0 || node.x > canvas.width) node.vx *= -1;
            if (node.y < 0 || node.y > canvas.height) node.vy *= -1;
        });

        // Draw connections
        nodes.forEach((node, i) => {
            nodes.slice(i + 1).forEach(otherNode => {
                const dx = node.x - otherNode.x;
                const dy = node.y - otherNode.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < connectionDistance) {
                    const opacity = (1 - distance / connectionDistance) * 0.3;
                    ctx.strokeStyle = `rgba(0, 212, 255, ${opacity})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(node.x, node.y);
                    ctx.lineTo(otherNode.x, otherNode.y);
                    ctx.stroke();
                }
            });
        });

        // Draw nodes
        nodes.forEach(node => {
            ctx.fillStyle = 'rgba(0, 212, 255, 0.8)';
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            ctx.fill();
        });

        animationId = requestAnimationFrame(animate);
    }

    animate();
}

/* ============================================
   FLOATING PARTICLES
   ============================================ */

function initParticles() {
    const container = document.getElementById('particlesContainer');
    if (!container) return;

    const particleCount = 30;

    for (let i = 0; i < particleCount; i++) {
        createParticle(container, i);
    }

    // Add more particles on scroll
    let ticking = false;
    window.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(() => {
                addScrollParticles(container);
                ticking = false;
            });
            ticking = true;
        }
    });
}

function createParticle(container, index) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.animationDelay = `${Math.random() * 15}s`;
    particle.style.animationDuration = `${15 + Math.random() * 10}s`;

    // Vary colors
    const colors = ['var(--primary)', 'var(--secondary)', 'var(--accent)'];
    particle.style.background = colors[Math.floor(Math.random() * colors.length)];
    particle.style.boxShadow = `0 0 10px ${particle.style.background}, 0 0 20px ${particle.style.background}`;

    container.appendChild(particle);

    // Reset animation
    particle.addEventListener('animationend', () => {
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.animationName = 'none';
        particle.offsetHeight; // Trigger reflow
        particle.style.animationName = 'particleFloat';
    });
}

function addScrollParticles(container) {
    // Add subtle particles on scroll
    if (Math.random() > 0.7) {
        createParticle(container, Math.random() * 100);
    }
}

/* ============================================
   SCROLL REVEAL ANIMATIONS
   ============================================ */

function initScrollReveal() {
    const reveals = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });

    reveals.forEach(el => observer.observe(el));
}

/* ============================================
   HEADER SCROLL EFFECT
   ============================================ */

function initHeader() {
    const header = document.getElementById('header');
    if (!header) return;

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });
}

/* ============================================
   COUNT UP ANIMATION
   ============================================ */

function initCountUp() {
    const statValues = document.querySelectorAll('.stat-value[data-count]');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const target = entry.target;
                const count = parseInt(target.dataset.count);
                animateValue(target, 0, count, 2000);
                observer.unobserve(target);
            }
        });
    }, { threshold: 0.5 });

    statValues.forEach(el => observer.observe(el));
}

function animateValue(element, start, end, duration) {
    let startTimestamp = null;

    function step(timestamp) {
        if (!startTimestamp) startTimestamp = timestamp;

        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const value = Math.floor(progress * (end - start) + start);

        element.textContent = value;

        if (progress < 1) {
            requestAnimationFrame(step);
        }
    }

    requestAnimationFrame(step);
}

/* ============================================
   FORM PROGRESS INDICATOR
   ============================================ */

function initFormProgress() {
    const form = document.getElementById('contactForm');
    const progress = document.getElementById('formProgress');

    if (!form || !progress) return;

    const inputs = form.querySelectorAll('input, select, textarea');
    let filledCount = 0;

    inputs.forEach(input => {
        input.addEventListener('input', () => {
            filledCount = Array.from(inputs).filter(i => i.value.trim() !== '').length;
            const percentage = (filledCount / inputs.length) * 100;
            progress.style.width = `${percentage}%`;
        });
    });
}

/* ============================================
   MOBILE MENU
   ============================================ */

function initMobileMenu() {
    const btn = document.getElementById('mobileMenuBtn');
    const nav = document.getElementById('nav');

    if (!btn || !nav) return;

    btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        nav.classList.toggle('mobile-open');
    });

    // Close menu when clicking links
    nav.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            btn.classList.remove('active');
            nav.classList.remove('mobile-open');
        });
    });
}

/* ============================================
   PARALLAX EFFECT
   ============================================ */

function initParallax() {
    const layers = document.querySelectorAll('.bg-effects canvas, .holographic-waves');
    let ticking = false;

    window.addEventListener('mousemove', (e) => {
        if (!ticking) {
            requestAnimationFrame(() => {
                const x = (e.clientX / window.innerWidth - 0.5) * 20;
                const y = (e.clientY / window.innerHeight - 0.5) * 20;

                layers.forEach(layer => {
                    layer.style.transform = `translate(${x}px, ${y}px)`;
                });

                ticking = false;
            });
            ticking = true;
        }
    });
}

/* ============================================
   PARTICLE BURST ON CTA CLICKS
   ============================================ */

function initParticleBurst() {
    const ctaButtons = document.querySelectorAll('.cta-primary, .cta-secondary, .pricing-cta, .submit-btn');

    ctaButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            createParticleBurst(e.clientX, e.clientY);
        });
    });
}

function createParticleBurst(x, y) {
    const burst = document.createElement('div');
    burst.className = 'particle-burst';
    burst.style.left = `${x}px`;
    burst.style.top = `${y}px`;

    const particleCount = 12;

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'burst-particle';

        const angle = (i / particleCount) * Math.PI * 2;
        const distance = 50 + Math.random() * 50;
        const tx = Math.cos(angle) * distance;
        const ty = Math.sin(angle) * distance;

        particle.style.setProperty('--tx', `${tx}px`);
        particle.style.setProperty('--ty', `${ty}px`);

        const colors = ['var(--primary)', 'var(--secondary)', 'var(--accent)'];
        particle.style.background = colors[Math.floor(Math.random() * colors.length)];

        burst.appendChild(particle);
    }

    document.body.appendChild(burst);

    setTimeout(() => burst.remove(), 1000);
}

/* ============================================
   SMOOTH SCROLL FOR NAVIGATION
   ============================================ */

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (!href || href === '#') {
            return;
        }

        try {
            const target = document.querySelector(href);
            if (!target) {
                return;
            }

            e.preventDefault();
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        } catch (_error) {
            // Ignore invalid selectors from malformed hash links.
        }
    });
});

/* ============================================
   SERVICE CARD HOVER EFFECTS
   ============================================ */

const serviceCards = document.querySelectorAll('.service-card');

serviceCards.forEach(card => {
    card.addEventListener('mouseenter', () => {
        // Add subtle tilt effect
        card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateY(-5px)';
    });

    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = (y - centerY) / 20;
        const rotateY = (centerX - x) / 20;

        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-5px)`;
    });

    card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateY(0)';
    });
});

/* ============================================
   FORM VALIDATION & SUBMISSION
   ============================================ */

const contactForm = document.getElementById('contactForm');

if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
        e.preventDefault();

        // Get form data
        const formData = new FormData(contactForm);
        const data = Object.fromEntries(formData);

        // Simple validation
        if (!data.name || !data.email) {
            alert('Please fill in required fields');
            return;
        }

        // Show success message
        const submitBtn = contactForm.querySelector('.submit-btn');
        const originalText = submitBtn.querySelector('.btn-text').textContent;

        submitBtn.querySelector('.btn-text').textContent = 'Sent Successfully!';
        submitBtn.style.background = 'var(--accent)';

        setTimeout(() => {
            submitBtn.querySelector('.btn-text').textContent = originalText;
            submitBtn.style.background = '';
            contactForm.reset();
            document.getElementById('formProgress').style.width = '0';
        }, 3000);
    });
}

/* ============================================
   PERFORMANCE OPTIMIZATION
   ============================================ */

// Lazy load images (if any added later)
if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.src) {
                    img.src = img.dataset.src;
                    imageObserver.unobserve(img);
                }
            }
        });
    });

    document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
    });
}

// Reduce animations on mobile for performance
if (window.innerWidth < 768) {
    document.documentElement.style.setProperty('--transition-medium', '0.2s ease');
    document.documentElement.style.setProperty('--transition-slow', '0.3s ease');
}
