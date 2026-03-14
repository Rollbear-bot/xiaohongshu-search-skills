#!/usr/bin/env node
/**
 * 小红书搜索Skill主脚本
 * 调用方式: node search.js [关键词] [结果数量=10]
 */

const { execSync } = require('child_process');

const keyword = process.argv[2];
const limit = parseInt(process.argv[3] || '10');

if (!keyword) {
  console.error('请输入搜索关键词');
  process.exit(1);
}

console.log(`🔍 正在小红书搜索: ${keyword}`);
console.log('='.repeat(50));

try {
  // 1. 执行搜索
  const searchResult = execSync(`mcporter call Xiaohongshu.search_feeds keyword="${keyword}" filters='{}'`, { encoding: 'utf8' });
  const feeds = JSON.parse(searchResult).feeds || [];
  
  if (feeds.length === 0) {
    console.log('❌ 未找到相关内容');
    process.exit(0);
  }

  // 2. 按点赞量排序，取前N条
  const topFeeds = feeds
    .filter(feed => feed.modelType === 'note')
    .sort((a, b) => parseInt(b.noteCard.interactInfo.likedCount) - parseInt(a.noteCard.interactInfo.likedCount))
    .slice(0, limit);

  console.log(`✅ 找到 ${topFeeds.length} 条相关笔记，开始分析...\n`);

  // 3. 获取每篇帖子详情
  const posts = [];
  for (const feed of topFeeds) {
    try {
      console.log(`📖 正在读取: ${feed.noteCard.displayTitle}`);
      const detailResult = execSync(
        `mcporter call Xiaohongshu.get_feed_detail feed_id="${feed.id}" xsec_token="${feed.xsecToken}" load_all_comments=true limit=20 click_more_replies=true`,
        { encoding: 'utf8' }
      );
      const detail = JSON.parse(detailResult);
      posts.push({
        id: feed.id,
        xsecToken: feed.xsecToken,
        title: feed.noteCard.displayTitle,
        author: feed.noteCard.user.nickName,
        likedCount: feed.noteCard.interactInfo.likedCount,
        collectedCount: feed.noteCard.interactInfo.collectedCount,
        commentCount: feed.noteCard.interactInfo.commentCount,
        content: detail.content || '',
        comments: detail.comments || [],
        createdAt: detail.createdAt || new Date().toISOString().split('T')[0]
      });
    } catch (e) {
      console.log(`⚠️  读取笔记失败: ${feed.noteCard.displayTitle}`);
      continue;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 分析完成，生成报告...\n');

  // 4. 生成报告
  generateReport(posts, keyword);

} catch (e) {
  console.error('❌ 搜索失败:', e.message);
  process.exit(1);
}

/**
 * 生成结构化报告
 */
function generateReport(posts, keyword) {
  console.log(`# 小红书「${keyword}」搜索结果总结\n`);

  // 整体总结
  console.log('## 一、整体总结');
  const allContent = posts.map(p => p.content).join(' ');
  const keywords = extractKeywords(allContent);
  const mainPoints = extractMainPoints(posts);
  
  mainPoints.forEach((point, i) => {
    console.log(`${i + 1}. ${point}`);
  });
  console.log();

  // 评论区分析
  console.log('## 二、评论区分析');
  const allComments = posts.flatMap(p => p.comments);
  const sentiment = analyzeSentiment(allComments);
  const hotTopics = extractHotTopics(allComments);
  
  console.log(`- 意见倾向：正面 ${sentiment.positive}% / 中性 ${sentiment.neutral}% / 负面 ${sentiment.negative}%`);
  console.log('- 高频讨论点：' + hotTopics.join('、'));
  console.log();

  // 参考帖子列表
  console.log('## 三、参考帖子列表');
  console.log('| 序号 | 帖子标题 | 作者 | 发表时间 | 互动数据 | 笔记ID |');
  console.log('|------|----------|------|----------|----------|--------|');
  posts.forEach((post, i) => {
    const date = post.createdAt.split('T')[0];
    const stats = `👍${post.likedCount}/⭐${post.collectedCount}/💬${post.commentCount}`;
    console.log(`| ${i + 1} | ${post.title} | ${post.author} | ${date} | ${stats} | ${post.id} |`);
  });
  console.log();
}

/**
 * 提取关键词
 */
function extractKeywords(text) {
  // 简化实现，实际可使用NLP
  const words = text.match(/[\u4e00-\u9fa5]{2,}/g) || [];
  const freq = {};
  words.forEach(w => freq[w] = (freq[w] || 0) + 1);
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(x => x[0]);
}

/**
 * 提取主要观点
 */
function extractMainPoints(posts) {
  const points = [];
  // 简化实现，实际可使用LLM分析
  posts.slice(0, 5).forEach((post, i) => {
    const firstSentence = post.content.split(/[。！？]/)[0] || '内容未获取';
    points.push(`${firstSentence}[${i + 1}]`);
  });
  return points;
}

/**
 * 情感分析
 */
function analyzeSentiment(comments) {
  // 简化实现，实际可使用情感分析模型
  const positiveWords = ['好', '不错', '推荐', '值得', '喜欢', '棒', '赞', '满意', '太棒', '完美'];
  const negativeWords = ['差', '不好', '失望', '坑', '后悔', '垃圾', '糟糕', '浪费', '不值', '差评'];
  
  let positive = 0, negative = 0, neutral = 0;
  
  comments.forEach(comment => {
    const text = comment.content || '';
    let pos = positiveWords.some(w => text.includes(w)) ? 1 : 0;
    let neg = negativeWords.some(w => text.includes(w)) ? 1 : 0;
    
    if (pos > neg) positive++;
    else if (neg > pos) negative++;
    else neutral++;
  });
  
  const total = comments.length || 1;
  return {
    positive: Math.round(positive / total * 100),
    neutral: Math.round(neutral / total * 100),
    negative: Math.round(negative / total * 100)
  };
}

/**
 * 提取热门话题
 */
function extractHotTopics(comments) {
  const allText = comments.map(c => c.content).join(' ');
  return extractKeywords(allText).slice(0, 5);
}
